import mongoose from "mongoose";

const branchSchema = new mongoose.Schema({
     paperFile: {
         public_id: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
  },
})
export const SolvePaper = mongoose.model("SolvePaper", branchSchema);

export default SolvePaper;
