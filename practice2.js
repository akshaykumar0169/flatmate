const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
const PORT = 3000;

// Middleware for parsing forms and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors({
    origin: true, // Allow all origins for development
    credentials: true // Allow credentials to be sent
}));

// Session middleware
app.use(session({
    secret: 'your-secret-key-here-change-in-production', // Change this in production
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Serve static files (uploads, html, css, js)
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer setup for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/flatmatefinder', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', err => console.error('MongoDB connection error:', err));
db.once('open', () => console.log('MongoDB connection successful'));

// User schema and model - Enhanced with validation
const userSchema = new mongoose.Schema({
    fullname: { type: String, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 18, max: 100 },
    gender: { type: String, required: true, enum: ['Male', 'Female', 'Other'] },
    occupation: { type: String, required: true, trim: true },
    password: { type: String, required: true }, // hash in production
    confirm: String,
    terms: { type: Boolean, required: true },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Flatmate requirement schema and model (updated to include userId)
const postSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userEmail: String, // Add email for easier querying
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

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// User registration
app.post('/submit', async (req, res) => {
    const { fullname, email, phone, age, gender, occupation, password, confirm, terms } = req.body;
    
    if (password !== confirm) return res.status(400).send('Passwords do not match.');
    if (terms !== 'on') return res.status(400).send('You must accept the terms.');

    try {
        if (await User.findOne({ email })) return res.status(400).send('User with this email already exists.');
        
        const user = new User({ fullname, email, phone, age, gender, occupation, password, confirm, terms: true });
        await user.save();
        
        res.redirect('/login.html');
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).send('Error saving user data.');
    }
});

// User login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) return res.json({ success: false, message: 'Email and password are required' });

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || user.password !== password) {
            return res.json({ success: false, message: 'Invalid email or password' });
        }

        // Set session
        req.session.userId = user._id;
        req.session.userEmail = user.email;
        req.session.userName = user.fullname;

        console.log('User logged in:', { userId: user._id, email: user.email });

        res.json({
            success: true,
            message: 'Login successful! Redirecting...',
            redirect: 'user-dashboard.html',
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

// ENHANCED Update user profile endpoint
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
        console.log('Post created:', post._id);
        res.status(201).json({ success: true, message: 'Requirement posted successfully!', post });
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
        const data = await Requirement.find().populate('userId', 'fullname email').sort({ createdAt: -1 });
        res.json({ success: true, data });
    } catch (err) {
        console.error('Get requirements error:', err);
        res.status(500).json({ success: false });
    }
});

// Logout endpoint
app.post('/logout', (req, res) => {
    console.log('User logging out:', req.session.userId);
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ success: false, message: 'Could not log out' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('🚀 Flatmate Finder is ready!');
    console.log('📊 Features: User Authentication, Profile Management, Post Management');
    console.log('🛠️ Enhanced Profile Update: PUT /api/profile endpoint is active');
});




















//search-listing js

// Add this enhanced search endpoint to your server.js file

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

// Save listing to user's favorites (if user is logged in)
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

        // In a real app, you'd have a separate favorites/saved listings schema
        // For now, we'll just return success
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




//ORIGINAL CODE ENDS HERE