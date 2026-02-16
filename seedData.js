import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Course from './models/Course.js';
import Branch from './models/Branch.js';
import User from './models/User.js';

dotenv.config();

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');

    // Clear existing data
    await Course.deleteMany({});
    await Branch.deleteMany({});
    console.log('Existing data cleared');

    // Create Courses
    const courses = await Course.insertMany([
      {
        name: 'B.Tech',
        code: 'BTH',
        description: 'Bachelor of Technology - 4 year undergraduate program',
        color: '#3B82F6'
      },
      {
        name: 'MCA',
        code: 'MCA',
        description: 'Master of Computer Applications - 2 year postgraduate program',
        color: '#14B8A6'
      },
      {
        name: 'Diploma',
        code: 'DIP',
        description: 'Diploma in Engineering - 3 year program',
        color: '#F43F5E'
      },
      {
        name: 'BSC',
        code: 'BSC',
        description: 'Bachelor of Science - 3 year undergraduate program',
        color: '#A855F7'
      },
      {
        name: 'MSC',
        code: 'MSC',
        description: 'Master of Science - 2 year postgraduate program',
        color: '#FB923C'
      },
      {
        name: 'BCA',
        code: 'BCA',
        description: 'Bachelor of Computer Applications - 3 year undergraduate program',
        color: '#06B6D4'
      },
      {
        name: 'MBA',
        code: 'MBA',
        description: 'Master of Business Administration - 2 year postgraduate program',
        color: '#8B5CF6'
      },
      {
        name: 'BBA',
        code: 'BBA',
        description: 'Bachelor of Business Administration - 3 year undergraduate program',
        color: '#10B981'
      }
    ]);

    console.log('Courses created:', courses.length);

    // Create Branches for B.Tech
    const bTechBranches = await Branch.insertMany([
      {
        name: 'Computer Science',
        code: 'BTH-CS-266',
        course: courses[0]._id,
        description: 'Computer Science and Engineering',
        color: '#3B82F6',
        totalPapers: 0
      },
      {
        name: 'Mechanical Engineering',
        code: 'BTH-ME-312',
        course: courses[0]._id,
        description: 'Mechanical Engineering',
        color: '#EF4444',
        totalPapers: 0
      },
      {
        name: 'Electrical Engineering',
        code: 'BTH-EE-289',
        course: courses[0]._id,
        description: 'Electrical Engineering',
        color: '#F59E0B',
        totalPapers: 0
      },
      {
        name: 'Civil Engineering',
        code: 'BTH-CE-301',
        course: courses[0]._id,
        description: 'Civil Engineering',
        color: '#10B981',
        totalPapers: 0
      },
      {
        name: 'Electronics & Communication',
        code: 'BTH-EC-277',
        course: courses[0]._id,
        description: 'Electronics and Communication Engineering',
        color: '#8B5CF6',
        totalPapers: 0
      },
      {
        name: 'Information Technology',
        code: 'BTH-IT-294',
        course: courses[0]._id,
        description: 'Information Technology',
        color: '#06B6D4',
        totalPapers: 0
      }
    ]);

    console.log('B.Tech Branches created:', bTechBranches.length);

    // Create Admin User
    const adminExists = await User.findOne({ email: 'admin@savs.com' });
    if (!adminExists) {
      await User.create({
        name: 'Admin',
        email: 'admin@savs.com',
        password: 'admin123',
        role: 'admin',
        bio: 'System Administrator',
        location: 'Lucknow, India'
      });
      console.log('Admin user created');
    }

    // Create Sample User
    const userExists = await User.findOne({ email: 'user@savs.com' });
    if (!userExists) {
      await User.create({
        name: 'John Doe',
        email: 'user@savs.com',
        password: 'user123',
        role: 'user',
        bio: 'Student | Tech Enthusiast',
        location: 'Mumbai, India'
      });
      console.log('Sample user created');
    }

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📝 Login Credentials:');
    console.log('Admin: admin@savs.com / admin123');
    console.log('User: user@savs.com / user123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedData();
