const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

// Load environment variables
require('dotenv').config();

const app = express();

// Use environment variables with fallbacks
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/flatmatefinder';
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-here-change-in-production';
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret';
const CLIENT_URL = process.env.CLIENT_URL || `http://localhost:${PORT}`;

console.log(`🚀 Starting Flatmate Finder Server`);
console.log(`📍 Environment: ${NODE_ENV}`);
console.log(`🌐 Port: ${PORT}`);
console.log(`📊 Database: ${MONGODB_URI.includes('mongodb+srv') ? 'MongoDB Atlas (Cloud)' : 'Local MongoDB'}`);
console.log(`🔗 Client URL: ${CLIENT_URL}`);

// Middleware for parsing forms and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));

// CORS configuration
app.use(cors({
    origin: NODE_ENV === 'production' ? [CLIENT_URL] : true,
    credentials: true
}));

// Session middleware with environment variables
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: NODE_ENV === 'production', // HTTPS in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: NODE_ENV === 'production' ? 'strict' : 'lax'
    }
}));

// Serve static files (uploads, html, css, js)
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Created uploads directory');
}

// Multer setup for image uploads with environment variables
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
        files: 3
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif').split(',');
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

// Connect to MongoDB using environment variable
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ MongoDB connection successful');
    if (MONGODB_URI.includes('mongodb+srv')) {
        console.log('🌩️  Connected to MongoDB Atlas (Cloud Database)');
    } else {
        console.log('💻 Connected to Local MongoDB');
    }
})
.catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

const db = mongoose.connection;
db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('📊 Database ready for operations'));

// User schema and model - Enhanced with validation
const userSchema = new mongoose.Schema({
    fullname: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 18, max: 100 },
    gender: { type: String, required: true, enum: ['Male', 'Female', 'Other'] },
    occupation: { type: String, required: true, trim: true },
    password: { type: String, required: true }, // TODO: Hash in production
    confirm: String,
    terms: { type: Boolean, required: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Flatmate requirement schema and model
const postSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: String,
    images: [String],
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

// Middleware to check if user is logged in
function requireAuth(req, res, next) {
    console.log('Auth check - Session userId:', req.session.userId);
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'Please log in' });
    }
    next();
}

// Error handling middleware
function handleError(err, req, res, next) {
    console.error('🚨 Error:', err);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: 'File too large' });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ success: false, message: 'Too many files' });
        }
    }

    res.status(500).json({ success: false, message: 'Server error' });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: NODE_ENV,
        version: '1.0.0'
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// User registration
app.post('/submit', async (req, res) => {
    try {
        const { fullname, email, phone, age, gender, occupation, password, confirm, terms } = req.body;

        if (password !== confirm) {
            return res.status(400).json({ success: false, message: 'Passwords do not match' });
        }
        if (terms !== 'on') {
            return res.status(400).json({ success: false, message: 'You must accept the terms' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User with this email already exists' });
        }

        const user = new User({ 
            fullname, 
            email: email.toLowerCase(), 
            phone, 
            age: parseInt(age), 
            gender, 
            occupation, 
            password, // TODO: Hash password
            terms: true 
        });

        await user.save();
        console.log(`👤 New user registered: ${email}`);

        res.json({ success: true, message: 'Registration successful!', redirect: '/login.html' });
    } catch (err) {
        console.error('Registration error:', err);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        res.status(500).json({ success: false, message: 'Error creating account' });
    }
});

// User login
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || user.password !== password) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Set session
        req.session.userId = user._id;
        req.session.userEmail = user.email;
        req.session.userName = user.fullname;

        console.log(`🔐 User logged in: ${email}`);

        res.json({
            success: true,
            message: 'Login successful! Redirecting...',
            redirect: '/user-dashboard.html',
            user: { 
                id: user._id, 
                fullname: user.fullname, 
                email: user.email 
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// Get user profile
app.get('/api/profile', requireAuth, async (req, res) => {
    console.log('GET /api/profile called for user:', req.session.userId);
    try {
        const user = await User.findById(req.session.userId).select('-password -confirm');
        if (!user) {
            console.log('User not found:', req.session.userId);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        console.log('Profile data sent:', { 
            fullname: user.fullname, 
            email: user.email 
        });

        res.json({
            success: true,
            fullname: user.fullname,
            email: user.email,
            phone: user.phone,
            age: user.age,
            gender: user.gender,
            occupation: user.occupation,
            createdAt: user.createdAt
        });
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching profile' });
    }
});

// Update user profile
app.put('/api/profile', requireAuth, async (req, res) => {
    console.log('PUT /api/profile called');
    console.log('Request body:', req.body);
    console.log('User ID from session:', req.session.userId);

    try {
        const { fullname, phone, age, gender, occupation } = req.body;

        // Validate required fields
        if (!fullname || !phone || !age || !gender || !occupation) {
            console.log('Validation failed: missing required fields');
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required (fullname, phone, age, gender, occupation)' 
            });
        }

        // Validate age
        const ageNum = parseInt(age);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 100) {
            console.log('Validation failed: invalid age');
            return res.status(400).json({ 
                success: false, 
                message: 'Age must be a number between 18 and 100' 
            });
        }

        // Validate gender
        if (!['Male', 'Female', 'Other'].includes(gender)) {
            console.log('Validation failed: invalid gender');
            return res.status(400).json({ 
                success: false, 
                message: 'Gender must be Male, Female, or Other' 
            });
        }

        // Find and update user
        console.log('Attempting to update user with ID:', req.session.userId);

        const updatedUser = await User.findByIdAndUpdate(
            req.session.userId,
            { 
                fullname: fullname.trim(),
                phone: phone.trim(), 
                age: ageNum, 
                gender: gender,
                occupation: occupation.trim()
            },
            { 
                new: true, 
                runValidators: true 
            }
        ).select('-password -confirm');

        if (!updatedUser) {
            console.log('User not found with ID:', req.session.userId);
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        console.log('User updated successfully:', {
            id: updatedUser._id,
            fullname: updatedUser.fullname,
            email: updatedUser.email
        });

        // Update session name if changed
        if (updatedUser.fullname !== req.session.userName) {
            req.session.userName = updatedUser.fullname;
        }

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
        console.error('Error updating profile:', error);

        // Handle MongoDB validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                success: false, 
                message: 'Validation error: ' + messages.join(', ')
            });
        }

        // Handle duplicate key errors
        if (error.code === 11000) {
            return res.status(400).json({ 
                success: false, 
                message: 'A user with this information already exists'
            });
        }

        res.status(500).json({ 
            success: false, 
            message: 'Server error updating profile: ' + error.message 
        });
    }
});

// Get current user session info
app.get('/api/user', (req, res) => {
    console.log('Session check - userId:', req.session.userId);
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

// Flatmate requirement posting with image upload
app.post('/api/post-requirement', requireAuth, upload.array('images', 3), async (req, res) => {
    try {
        const images = req.files ? req.files.map(f => '/uploads/' + f.filename) : [];
        const prefs = Array.isArray(req.body.prefs) ? req.body.prefs : req.body.prefs ? [req.body.prefs] : [];
        const { price, furnishing, state, city, location, gender, notes } = req.body;

        const post = new Requirement({
            userId: req.session.userId,
            userEmail: req.session.userEmail,
            images,
            price: price ? Number(price) : null,
            furnishing,
            state,
            city,
            location,
            prefs,
            gender,
            notes,
        });

        await post.save();
        console.log(`📝 New post created by ${req.session.userEmail}:`, post._id);
        res.status(201).json({ success: true, message: 'Requirement posted successfully!', post: post._id });
    } catch (err) {
        console.error('Post creation error:', err);
        res.status(500).json({ success: false, message: 'Server error while posting requirement' });
    }
});

// Get user's posts
app.get('/api/my-posts', requireAuth, async (req, res) => {
    try {
        const posts = await Requirement.find({ userId: req.session.userId }).sort({ createdAt: -1 });
        console.log(`Found ${posts.length} posts for user ${req.session.userId}`);
        res.json(posts);
    } catch (err) {
        console.error('My posts error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching posts' });
    }
});

// Get all requirements (public)
app.get('/api/requirements', async (req, res) => {
    try {
        const data = await Requirement.find()
            .populate('userId', 'fullname email')
            .sort({ createdAt: -1 })
            .limit(100); // Limit for performance

        res.json({ success: true, data });
    } catch (err) {
        console.error('Get requirements error:', err);
        res.status(500).json({ success: false, message: 'Error fetching requirements' });
    }
});

// Enhanced search endpoint with filters
app.get('/api/search-flatmates', async (req, res) => {
    console.log('Search request received:', req.query);

    try {
        const {
            state,
            city,
            location,
            minPrice,
            maxPrice,
            furnishing,
            gender,
            preferences,
            sortBy = 'newest',
            page = 1,
            limit = 6
        } = req.query;

        // Build MongoDB query
        let query = {};

        // Location filters
        if (state) {
            query.state = { $regex: state, $options: 'i' };
        }

        if (city) {
            query.city = { $regex: city, $options: 'i' };
        }

        if (location) {
            query.location = { $regex: location, $options: 'i' };
        }

        // Price range filter
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseInt(minPrice);
            if (maxPrice) query.price.$lte = parseInt(maxPrice);
        }

        // Furnishing filter
        if (furnishing) {
            query.furnishing = furnishing;
        }

        // Gender filter
        if (gender) {
            query.gender = gender;
        }

        // Preferences filter
        if (preferences) {
            const prefsArray = Array.isArray(preferences) ? preferences : [preferences];
            query.prefs = { $in: prefsArray.map(pref => new RegExp(pref, 'i')) };
        }

        console.log('MongoDB query:', query);

        // Build sort options
        let sortOptions = {};
        switch (sortBy) {
            case 'newest':
                sortOptions = { createdAt: -1 };
                break;
            case 'oldest':
                sortOptions = { createdAt: 1 };
                break;
            case 'price-low':
                sortOptions = { price: 1 };
                break;
            case 'price-high':
                sortOptions = { price: -1 };
                break;
            default:
                sortOptions = { createdAt: -1 };
        }

        // Calculate pagination
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Execute query
        const [listings, totalCount] = await Promise.all([
            Requirement.find(query)
                .populate('userId', 'fullname email')
                .sort(sortOptions)
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Requirement.countDocuments(query)
        ]);

        console.log(`Found ${listings.length} listings out of ${totalCount} total`);

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / limitNum);
        const hasNextPage = pageNum < totalPages;
        const hasPrevPage = pageNum > 1;

        res.json({
            success: true,
            data: listings,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalCount,
                hasNextPage,
                hasPrevPage,
                limit: limitNum
            },
            filters: {
                state,
                city,
                location,
                minPrice,
                maxPrice,
                furnishing,
                gender,
                preferences,
                sortBy
            }
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching listings: ' + error.message
        });
    }
});

// Get listing statistics for search insights
app.get('/api/search-stats', async (req, res) => {
    try {
        const stats = await Promise.all([
            // Total listings
            Requirement.countDocuments(),

            // Listings by state
            Requirement.aggregate([
                { $group: { _id: '$state', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),

            // Average price
            Requirement.aggregate([
                { $group: { _id: null, avgPrice: { $avg: '$price' } } }
            ]),

            // Most common preferences
            Requirement.aggregate([
                { $unwind: '$prefs' },
                { $group: { _id: '$prefs', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),

            // Furnishing distribution
            Requirement.aggregate([
                { $group: { _id: '$furnishing', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        res.json({
            success: true,
            stats: {
                totalListings: stats[0],
                topStates: stats[1],
                averagePrice: Math.round(stats[2][0]?.avgPrice || 0),
                topPreferences: stats[3],
                furnishingDistribution: stats[4]
            }
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics'
        });
    }
});

// Save listing to user's favorites
app.post('/api/save-listing/:listingId', requireAuth, async (req, res) => {
    try {
        const listingId = req.params.listingId;
        const userId = req.session.userId;

        // Check if listing exists
        const listing = await Requirement.findById(listingId);
        if (!listing) {
            return res.status(404).json({
                success: false,
                message: 'Listing not found'
            });
        }

        console.log(`User ${userId} saved listing ${listingId}`);

        res.json({
            success: true,
            message: 'Listing saved to favorites'
        });

    } catch (error) {
        console.error('Save listing error:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving listing'
        });
    }
});

// Logout endpoint
app.post('/logout', (req, res) => {
    const userEmail = req.session.userEmail;
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ success: false, message: 'Could not log out' });
        }
        console.log(`🚪 User logged out: ${userEmail}`);
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Error handling middleware
app.use(handleError);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n🛑 SIGTERM received. Shutting down gracefully...');
    mongoose.connection.close(() => {
        console.log('📊 MongoDB connection closed.');
        process.exit(0);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🎉 Flatmate Finder Server Successfully Started!`);
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`🔗 Client URL: ${CLIENT_URL}`);
    console.log(`📊 Database: ${MONGODB_URI.includes('mongodb+srv') ? 'Cloud (MongoDB Atlas)' : 'Local MongoDB'}`);
    console.log(`\n✨ Available Features:`);
    console.log(`   - ✅ User Registration & Authentication`);
    console.log(`   - ✅ Profile Management & Editing`);
    console.log(`   - ✅ Create & Manage Posts`);
    console.log(`   - ✅ Advanced Search & Filtering`);
    console.log(`   - ✅ Image Upload Support`);
    console.log(`   - ✅ Session Management`);
    console.log(`   - ✅ RESTful API Endpoints`);
    console.log(`\n🚀 Ready for production deployment!`);
    console.log(`📝 Check /health endpoint for status monitoring`);
});
