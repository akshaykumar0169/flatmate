const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
// const fs = require('fs'); // No longer needed
const session = require('express-session');
const http = require('http');
const socketIO = require('socket.io');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2; // <-- ADDED
const { CloudinaryStorage } = require('multer-storage-cloudinary'); // <-- ADDED
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // <-- ADDED for Render deployment
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: true,
        credentials: true
    }
});
const PORT = process.env.PORT || 3000;

// ============================================================================
// CLOUDINARY CONFIGURATION (NEW)
// ============================================================================
// This reads the credentials from your .env file
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

//MIDWARE
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({
    origin: true,
    credentials: true
}));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-here-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // <-- MODIFIED for Render (HTTPS)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Serve static files
app.use(express.static(__dirname));
// app.use('/uploads', ...); // <-- REMOVED (no longer needed)

// Ensure upload directory exists (REMOVED)

// ============================================================================
// MULTER SETUP FOR IMAGE UPLOADS (REPLACED WITH CLOUDINARY)
// ============================================================================

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'flatmate-finder-uploads', // This will create a folder in Cloudinary
        allowed_formats: ['jpeg', 'jpg', 'png', 'gif']
        // You can add transformations here if you want
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// ============================================================================
// MONGODB CONNECTION
// ============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/flatmatefinder';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
});
db.once('open', () => {
    console.log('✅ MongoDB connected successfully');
});

// ============================================================================
// DATABASE SCHEMAS
// ============================================================================

// User Schema
const userSchema = new mongoose.Schema({
    fullname: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 18, max: 100 },
    gender: { type: String, required: true, enum: ['Male', 'Female', 'Other'] },
    occupation: { type: String, required: true, trim: true },
    password: { type: String, required: true },
    confirm: String,
    terms: { type: Boolean, required: true },
    emailVerified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Post/Requirement Schema
const postSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: String,
    images: [String], // Will store an array of Cloudinary URLs
    price: Number,
    furnishing: String,
    state: String,
    city: String,
    location: String,
    prefs: [String],
    gender: String,
    notes: String,
    createdAt: { type: Date, default: Date.now },
});

const Requirement = mongoose.model('Requirement', postSchema);

// SavedPost Schema (NEW)
const savedPostSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement', required: true },
    savedAt: { type: Date, default: Date.now }
});

savedPostSchema.index({ userId: 1, postId: 1 }, { unique: true });
const SavedPost = mongoose.model('SavedPost', savedPostSchema);

// Conversation Schema (NEW)
const conversationSchema = new mongoose.Schema({
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessage: { type: String, default: '' },
    lastMessageTime: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

conversationSchema.index({ participants: 1 });
const Conversation = mongoose.model('Conversation', conversationSchema);

// Message Schema (NEW)
const messageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

messageSchema.index({ conversationId: 1, createdAt: -1 });
const Message = mongoose.model('Message', messageSchema);

// OTP Schema (NEW)
const otpSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 600 } // Expires in 10 minutes
});

const OTP = mongoose.model('OTP', otpSchema);

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            message: 'Please log in to access this resource'
        });
    }
    next();
}

// ============================================================================
// EMAIL CONFIGURATION (NODEMAILER)
// ============================================================================

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // IMPORTANT: Use a 16-digit Google App Password here
    }
});

// Verify transporter configuration
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter.verify((error, success) => {
        if (error) {
            console.log('❌ Email transporter error:', error);
        } else {
            console.log('✅ Email server is ready');
        }
    });
}

// ============================================================================
// ROUTES - BASIC
// ============================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================================
// ROUTES - AUTHENTICATION
// ============================================================================

// User Registration
app.post('/submit', async (req, res) => {
    const { fullname, email, phone, age, gender, occupation, password, confirm, terms } = req.body;

    if (password !== confirm) {
        return res.status(400).send('Passwords do not match.');
    }

    if (terms !== 'on') {
        return res.status(400).send('You must accept the terms and conditions.');
    }

    try {
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).send('User with this email already exists.');
        }

        const user = new User({
            fullname,
            email: email.toLowerCase(),
            phone,
            age: Number(age),
            gender,
            occupation,
            password,
            confirm,
            terms: true
        });

        await user.save();
        console.log('✅ New user registered:', email);
        res.redirect('/login.html');

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).send('Error saving user data. Please try again.');
    }
});

// User Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.json({
            success: false,
            message: 'Email and password are required'
        });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user || user.password !== password) {
            return res.json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        req.session.userId = user._id;
        req.session.userEmail = user.email;
        req.session.userName = user.fullname;

        console.log('✅ User logged in:', email);

        res.json({
            success: true,
            message: 'Login successful!',
            redirect: 'user-dashboard.html',
            user: {
                id: user._id,
                fullname: user.fullname,
                email: user.email
            }
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

// User Logout
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Could not log out'
            });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Get User Session
app.get('/api/user', (req, res) => {
    if (req.session.userId) {
        res.json({
            success: true,
            loggedIn: true,
            userId: req.session.userId,
            userEmail: req.session.userEmail,
            userName: req.session.userName
        });
    } else {
        res.json({
            success: true,
            loggedIn: false
        });
    }
});

// ============================================================================
// ROUTES - PROFILE MANAGEMENT
// ============================================================================

// Get Profile
app.get('/api/profile', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).select('-password -confirm');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            fullname: user.fullname,
            email: user.email,
            phone: user.phone,
            age: user.age,
            gender: user.gender,
            occupation: user.occupation,
            emailVerified: user.emailVerified,
            createdAt: user.createdAt
        });

    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error fetching profile'
        });
    }
});

// Update Profile
app.put('/api/profile', requireAuth, async (req, res) => {
    try {
        const { fullname, phone, age, gender, occupation } = req.body;

        if (!fullname || !phone || !age || !gender || !occupation) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        const ageNum = parseInt(age);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 100) {
            return res.status(400).json({
                success: false,
                message: 'Age must be between 18 and 100'
            });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.session.userId,
            {
                fullname: fullname.trim(),
                phone: phone.trim(),
                age: ageNum,
                gender,
                occupation: occupation.trim()
            },
            { new: true, runValidators: true }
        ).select('-password -confirm');

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (updatedUser.fullname !== req.session.userName) {
            req.session.userName = updatedUser.fullname;
        }

        console.log('✅ Profile updated:', updatedUser.email);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                fullname: updatedUser.fullname,
                email: updatedUser.email,
                phone: updatedUser.phone,
                age: updatedUser.age,
                gender: updatedUser.gender,
                occupation: updatedUser.occupation
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ // <-- FIXED TYPO (was 5Z)
            success: false,
            message: 'Server error updating profile'
        });
    }
});

// ============================================================================
// ROUTES - EMAIL OTP VERIFICATION (NEW)
// ============================================================================

// Send OTP
app.post('/api/send-otp', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Delete any existing OTP for this email
        await OTP.findOneAndDelete({ email: user.email });

        // Save new OTP
        await new OTP({ email: user.email, otp }).save();

        // Send email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Email Verification OTP - Flatmate Finder',
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4CAF50;">Email Verification</h2>
          <p>Hello ${user.fullname},</p>
          <p>Your OTP for email verification is:</p>
          <h1 style="color: #4CAF50; font-size: 36px; letter-spacing: 5px;">${otp}</h1>
          <p>This OTP is valid for <strong>10 minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            This is an automated email from Flatmate Finder. Please do not reply.
          </p>
        </div>
      `
        };

        await transporter.sendMail(mailOptions);

        console.log('✅ OTP sent to:', user.email);

        res.json({
            success: true,
            message: 'OTP sent to your email'
        });

    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending OTP. Please check email configuration.'
        });
    }
});

// Verify OTP
app.post('/api/verify-otp', requireAuth, async (req, res) => {
    try {
        const { otp } = req.body;
        const user = await User.findById(req.session.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const otpRecord = await OTP.findOne({ email: user.email, otp: otp.trim() });

        if (!otpRecord) {
            return res.json({
                success: false,
                message: 'Invalid or expired OTP'
            });
        }

        // Update user as verified
        await User.findByIdAndUpdate(user._id, { emailVerified: true });

        // Delete the OTP
        await OTP.findOneAndDelete({ email: user.email });

        console.log('✅ Email verified:', user.email);

        res.json({
            success: true,
            message: 'Email verified successfully'
        });

    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP'
        });
    }
});

// ============================================================================
// ROUTES - POST MANAGEMENT
// ============================================================================

// Create Post
app.post('/api/post-requirement', requireAuth, upload.array('images', 3), async (req, res) => {
    try {
        // const images = req.files ? req.files.map(f => '/uploads/' + f.filename) : []; // <-- OLD WAY
        const images = req.files ? req.files.map(f => f.path) : []; // <-- NEW: Get Cloudinary URL
        const prefs = Array.isArray(req.body.prefs) ? req.body.prefs : req.body.prefs ? [req.body.prefs] : [];
        const { price, furnishing, state, city, location, gender, notes } = req.body;

        const post = new Requirement({
            userId: req.session.userId,
            userEmail: req.session.userEmail,
            images,
            price: Number(price),
            furnishing,
            state,
            city,
            location,
            prefs,
            gender,
            notes,
        });

        await post.save();
    console.log('✅ New post created by:', req.session.userEmail);

    // *** REPLACE THE REDIRECT WITH THIS JSON RESPONSE ***
    res.status(201).json({ 
        success: true, 
        message: 'Post created successfully' 
    });
        
    } catch (err) {
        console.error('Post creation error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error while posting requirement'
        });
    }
});

// Get My Posts
app.get('/api/my-posts', requireAuth, async (req, res) => {
    try {
        const posts = await Requirement.find({ userId: req.session.userId })
            .sort({ createdAt: -1 });

        res.json(posts);

    } catch (err) {
        console.error('My posts error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error fetching posts'
        });
    }
});

// Get All Posts
app.get('/api/requirements', async (req, res) => {
    try {
        const data = await Requirement.find()
            .populate('userId', 'fullname email')
            .sort({ createdAt: -1 });

        res.json({ success: true, data });

    } catch (err) {
        console.error('Get requirements error:', err);
        res.status(500).json({ success: false });
    }
});

// Search Flatmates
app.get('/api/search-flatmates', async (req, res) => {
    try {
        const {
            state, city, location,
            minPrice, maxPrice,
            furnishing, gender, preferences,
            sortBy = 'newest',
            page = 1, limit = 6
        } = req.query;

        let query = {};

        if (state) query.state = { $regex: state, $options: 'i' };
        if (city) query.city = { $regex: city, $options: 'i' };
        if (location) query.location = { $regex: location, $options: 'i' };

        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseInt(minPrice);
            if (maxPrice) query.price.$lte = parseInt(maxPrice);
        }

        if (furnishing) query.furnishing = furnishing;
        if (gender) query.gender = gender;

        if (preferences) {
            const prefsArray = Array.isArray(preferences) ? preferences : [preferences];
            query.prefs = { $in: prefsArray.map(pref => new RegExp(pref, 'i')) };
        }

        let sortOptions = {};
        switch (sortBy) {
            case 'newest': sortOptions = { createdAt: -1 }; break;
            case 'oldest': sortOptions = { createdAt: 1 }; break;
            case 'price-low': sortOptions = { price: 1 }; break;
            case 'price-high': sortOptions = { price: -1 }; break;
            default: sortOptions = { createdAt: -1 };
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const [listings, totalCount] = await Promise.all([
            Requirement.find(query)
                .populate('userId', 'fullname email')
                .sort(sortOptions)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Requirement.countDocuments(query)
        ]);

        const totalPages = Math.ceil(totalCount / limitNum);

        res.json({
            success: true,
            data: listings,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalCount,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
                limit: limitNum
            }
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching listings'
        });
    }
});

// ============================================================================
// *** NEW *** - DELETE POST ROUTE
// ============================================================================
app.delete('/api/my-posts/:postId', requireAuth, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.session.userId;

        // Find the post to ensure it belongs to the user and to get image URLs
        const post = await Requirement.findOne({ _id: postId, userId: userId });

        if (!post) {
            return res.status(403).json({
                success: false,
                message: 'Post not found or you are not authorized to delete it.'
            });
        }

        // Delete images from Cloudinary
        if (post.images && post.images.length > 0) {
            console.log('Deleting images from Cloudinary...');
            const deletePromises = post.images.map(imageUrl => {
                // Extract public_id from the URL
                // e.g., http://res.cloudinary.com/name/image/upload/v123/folder/public_id.jpg
                // We need "folder/public_id"
                const match = imageUrl.match(/flatmate-finder-uploads\/([^.]+)/);
                if (match && match[1]) {
                    const publicId = `flatmate-finder-uploads/${match[1]}`;
                    return new Promise((resolve, reject) => {
                        cloudinary.uploader.destroy(publicId, (error, result) => {
                            if (error) {
                                console.error('Cloudinary delete error:', error);
                                reject(error);
                            } else {
                                console.log('Cloudinary delete result:', result);
                                resolve(result);
                            }
                        });
                    });
                }
                return Promise.resolve(); // No image to delete
            });

            await Promise.all(deletePromises);
            console.log('Cloudinary images deleted.');
        }

        // Delete the post from MongoDB
        await Requirement.deleteOne({ _id: postId, userId: userId });

        console.log(`✅ Post ${postId} deleted by user ${userId}`);
        res.json({ success: true, message: 'Post deleted successfully.' });

    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting post.'
        });
    }
});


// ============================================================================
// ROUTES - SAVED POSTS (NEW)
// ============================================================================

// Save Post
app.post('/api/save-post/:postId', requireAuth, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.session.userId;

        const post = await Requirement.findById(postId);
        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        const existingSave = await SavedPost.findOne({ userId, postId });
        if (existingSave) {
            return res.json({
                success: true,
                message: 'Post already saved',
                alreadySaved: true
            });
        }

        const savedPost = new SavedPost({ userId, postId });
        await savedPost.save();

        console.log('✅ Post saved by user:', userId);

        res.json({
            success: true,
            message: 'Post saved successfully'
        });

    } catch (error) {
        console.error('Save post error:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving post'
        });
    }
});

// Unsave Post
app.delete('/api/save-post/:postId', requireAuth, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.session.userId;

        await SavedPost.findOneAndDelete({ userId, postId });

        console.log('✅ Post unsaved by user:', userId);

        res.json({
            success: true,
            message: 'Post unsaved successfully'
        });

    } catch (error) {
        console.error('Unsave post error:', error);
        res.status(500).json({
            success: false,
            message: 'Error unsaving post'
        });
    }
});

// Get Saved Posts
app.get('/api/saved-posts', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;

        const savedPosts = await SavedPost.find({ userId })
            .populate({
                path: 'postId',
                populate: { path: 'userId', select: 'fullname email' }
            })
            .sort({ savedAt: -1 });

        const posts = savedPosts
            .filter(sp => sp.postId)
            .map(sp => sp.postId);

        res.json({ success: true, data: posts });

    } catch (error) {
        console.error('Get saved posts error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching saved posts'
        });
    }
});

// Check if Post is Saved
app.get('/api/check-saved/:postId', requireAuth, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.session.userId;

        const saved = await SavedPost.findOne({ userId, postId });

        res.json({
            success: true,
            isSaved: !!saved
        });

    } catch (error) {
        console.error('Check saved error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking saved status'
        });
    }
});

// ============================================================================
// ROUTES - CHAT (NEW)
// ============================================================================

// Get All Conversations
app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;

        const conversations = await Conversation.find({ participants: userId })
            .populate('participants', 'fullname email')
            .sort({ lastMessageTime: -1 });

        const conversationsWithOtherUser = conversations.map(conv => {
            const otherUser = conv.participants.find(
                p => p._id.toString() !== userId.toString()
            );
            return {
                _id: conv._id,
                otherUser,
                lastMessage: conv.lastMessage,
                lastMessageTime: conv.lastMessageTime,
                createdAt: conv.createdAt
            };
        });

        res.json({
            success: true,
            conversations: conversationsWithOtherUser
        });

    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching conversations'
        });
    }
});

// Create or Get Conversation
app.post('/api/conversations', requireAuth, async (req, res) => {
    try {
        const { otherUserId } = req.body;
        const userId = req.session.userId;

        if (userId.toString() === otherUserId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot chat with yourself'
            });
        }

        let conversation = await Conversation.findOne({
            participants: { $all: [userId, otherUserId] }
        });

        if (!conversation) {
            conversation = new Conversation({
                participants: [userId, otherUserId]
            });
            await conversation.save();
            console.log('✅ New conversation created');
        }

        await conversation.populate('participants', 'fullname email');

        res.json({
            success: true,
            conversation
        });

    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating conversation'
        });
    }
});

// Get Messages for a Conversation
app.get('/api/messages/:conversationId', requireAuth, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.session.userId;

        // Verify user is part of conversation
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        });

        if (!conversation) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const messages = await Message.find({ conversationId })
            .populate('senderId', 'fullname email')
            .populate('receiverId', 'fullname email')
            .sort({ createdAt: 1 });

        // Mark messages as read
        await Message.updateMany(
            { conversationId, receiverId: userId, read: false },
            { read: true }
        );

        res.json({
            success: true,
            messages
        });

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching messages'
        });
    }
});

// Send Message
app.post('/api/messages', requireAuth, async (req, res) => {
    try {
        const { conversationId, receiverId, message } = req.body;
        const senderId = req.session.userId;

        // Verify conversation exists and user is participant
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: senderId
        });

        if (!conversation) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const newMessage = new Message({
            conversationId,
            senderId,
            receiverId,
            message
        });

        await newMessage.save();

        // Update conversation
        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: message.substring(0, 100),
            lastMessageTime: new Date()
        });

        await newMessage.populate('senderId', 'fullname email');
        await newMessage.populate('receiverId', 'fullname email');

        // Emit socket event for real-time delivery
        io.to(conversationId).emit('new-message', newMessage);

        console.log('✅ Message sent in conversation:', conversationId);

        res.json({
            success: true,
            message: newMessage
        });

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ // <-- FIXED TYPO (was 5M)
            success: false,
            message: 'Error sending message'
        });
    }
});

// ============================================================================
// SOCKET.IO EVENTS
// ============================================================================

io.on('connection', (socket) => {
    console.log('👤 User connected:', socket.id);

    socket.on('join-conversation', (conversationId) => {
        socket.join(conversationId);
        console.log(`✅ User ${socket.id} joined conversation ${conversationId}`);
    });

    socket.on('leave-conversation', (conversationId) => {
        socket.leave(conversationId);
        console.log(`❌ User ${socket.id} left conversation ${conversationId}`);
    });

    socket.on('disconnect', () => {
        console.log('👤 User disconnected:', socket.id);
    });
});

// ============================================================================
// START SERVER
// ============================================================================

server.listen(PORT, () => {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 FLATMATE FINDER V2.0 - SERVER STARTED');
    console.log('='.repeat(70));
    console.log(`📡 Server URL:        http://localhost:${PORT}`);
    console.log(`💾 MongoDB:           ${MONGODB_URI}`);
    console.log(`💬 Socket.IO:         Enabled`);
    console.log(`📧 Email OTP:         ${process.env.EMAIL_USER ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`🖼️ Cloudinary:        ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configured' : '❌ Not configured'}`); // <-- ADDED
    console.log('='.repeat(70));
    console.log('\n📋 Features Available:');
    console.log('  ✅ User Authentication & Profile Management');
    console.log('  ✅ Post Creation & Search (with Cloudinary)'); // <-- MODIFIED
    console.log('  ✅ Real-time Chat (Socket.IO)');
    console.log('  ✅ Save Posts');
    console.log('  ✅ Email OTP Verification');
    console.log('\n' + '='.repeat(70) + '\n');
});
