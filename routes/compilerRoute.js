// routes/compilerRoute.js
import express from 'express';
import axios   from 'axios';

const router = express.Router();
const PISTON_URL = 'https://emkc.org/api/v2/piston';

// ✅ Use "*" as version = always pick latest available — never gets 401 for bad version
const LANGUAGE_MAP = {
  python: { language: 'python', version: '*' },
  java:   { language: 'java',   version: '*' },
  c:      { language: 'c',      version: '*' },
  Cpp:    { language: 'c++',    version: '*' },
};

// POST /api/compiler
router.post('/', async (req, res) => {
    console.log(req.body);
  const { code, language, input } = req.body;

  if (!code || !code.trim()) {
    // ✅ Always return 200 with error field — NEVER return 401/403 to frontend
    return res.status(200).json({ output: '', error: 'No code provided.' });
  }

  const langCfg = LANGUAGE_MAP[language];
  if (!langCfg) {
    return res.status(200).json({
      output: '',
      error: `Unsupported language: "${language}". Supported: ${Object.keys(LANGUAGE_MAP).join(', ')}`
    });
  }

  console.log(`🔧 Compiling [${langCfg.language} latest] — ${code.length} chars`);

  try {
    const pistonRes = await axios.post(
      `${PISTON_URL}/execute`,
      {
        language: langCfg.language,
        version:  langCfg.version,   // "*" = latest
        files:    [{ name: 'main', content: code }],
        stdin:    input || '',
      },
      { timeout: 30000 }
    );

    const run = pistonRes.data?.run ?? {};
    const { stdout = '', stderr = '', code: exitCode = 0, signal = null } = run;

    // Killed by OOM / timeout signal
    if (signal) {
      return res.status(200).json({
        output: stdout,
        error:  `Killed by signal "${signal}". Check for infinite loops or excessive memory.`,
      });
    }

    // Success (exit 0) — return stdout, ignore stderr (just warnings)
    if (exitCode === 0) {
      return res.status(200).json({
        output:  stdout || 'Code ran successfully with no output.',
        error:   '',
        warning: stderr || '',
      });
    }

    // Compile/runtime error (non-zero exit)
    return res.status(200).json({
      output: stdout || '',
      error:  stderr || `Process exited with code ${exitCode}`,
    });

  } catch (err) {
    console.error('❌ Compiler route error:', err.message);

    // ✅ CRITICAL FIX: NEVER forward Piston's HTTP status (especially 401) to frontend.
    // Forwarding 401 → frontend api interceptor → triggers logout!
    // Always respond with 200 and put the error in the body.
    const pistonMsg =
      err.response?.data?.message ||
      err.response?.data?.error   ||
      (err.response ? `Piston HTTP ${err.response.status}` : null);

    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(200).json({
        output: '',
        error: '⏱️ Compilation timed out (>30s). Check for infinite loops.',
      });
    }

    return res.status(200).json({
      output: '',
      error: pistonMsg
        ? `Compiler service error: ${pistonMsg}`
        : `Compilation failed: ${err.message}`,
    });
  }
});

// GET /api/compiler/runtimes — for debugging available versions
router.get('/runtimes', async (_req, res) => {
  try {
    const { data } = await axios.get(`${PISTON_URL}/runtimes`, { timeout: 8000 });
    res.json(data);
  } catch (err) {
    res.status(200).json({ error: `Could not fetch runtimes: ${err.message}` });
  }
});

export default router;