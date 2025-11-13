# 🏠 Flatmate Finder - Complete Website

A fully functional flatmate finder website with user authentication, profile management, and post management.

## ✨ Features

### 🔐 **User Authentication**
- User registration and login
- Session-based authentication
- Secure logout
- Auto-redirect for logged-in users

### 👤 **Profile Management**
- View personal profile with real data from MongoDB
- User statistics (total posts, recent posts)
- Member since date
- Responsive profile page

### 📝 **Post Management**
- Create flatmate requirements with images
- View only your own posts in "My Posts"
- Posts are automatically associated with logged-in user
- Image uploads (up to 3 images per post)
- Detailed post information (budget, location, preferences)

### 🏠 **Dashboard**
- Personalized dashboard with user's name
- Real-time statistics
- Quick action buttons
- Modern card-based design

## 🚀 Quick Start

### Prerequisites
- **Node.js** (version 14 or higher)
- **MongoDB** (running locally on port 27017)

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start MongoDB**
   Make sure MongoDB is running on your system:
   ```bash
   mongod
   ```

3. **Start the Server**
   ```bash
   npm start
   # or
   node server.js
   ```

4. **Access the Website**
   Open your browser and go to: `http://localhost:3000`

## 📁 Project Structure

```
flatmate_finder_complete/
├── server.js                    # Main server file
├── package.json                 # Dependencies and scripts
├── uploads/                     # Image uploads directory
├── index.html                   # Home page
├── signup.html                  # User registration
├── login.html                   # User login
├── user-dashboard.html          # User dashboard
├── profile.html                 # User profile page
├── my-posts.html               # User's posts page
├── post-requirement.html        # Create new post
├── post-requirement-auth.js     # Authentication for posting
└── styles.css                   # Styling
```

## 🗄️ Database Schema

### Users Collection
```javascript
{
  fullname: String,
  email: String (unique),
  phone: String,
  age: Number,
  gender: String,
  occupation: String,
  password: String,
  terms: Boolean,
  createdAt: Date
}
```

### Requirements Collection
```javascript
{
  userId: ObjectId (references User),
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
  createdAt: Date
}
```

## 🔌 API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|---------|-------------|---------------|
| `/submit` | POST | User registration | No |
| `/login` | POST | User login | No |
| `/logout` | POST | User logout | Yes |
| `/api/user` | GET | Get current user session | No |
| `/api/profile` | GET | Get user profile data | Yes |
| `/api/my-posts` | GET | Get user's posts | Yes |
| `/api/post-requirement` | POST | Create new post | Yes |
| `/api/requirements` | GET | Get all posts (public) | No |

## 🎯 User Flow

1. **Registration** → User creates account (`/signup.html`)
2. **Login** → User logs in (`/login.html`)
3. **Dashboard** → User sees personalized dashboard (`/user-dashboard.html`)
4. **Create Posts** → User creates flatmate requirements (`/post-requirement.html`)
5. **View Posts** → User can see their posts (`/my-posts.html`)
6. **Profile** → User can view profile (`/profile.html`)
7. **Logout** → Session ends securely

## 💻 Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - MongoDB ODM
- **Express-Session** - Session management
- **Multer** - File upload handling
- **CORS** - Cross-origin resource sharing

### Frontend
- **HTML5** - Markup
- **CSS3** - Styling with modern design
- **JavaScript (ES6+)** - Client-side functionality
- **Fetch API** - HTTP requests
- **Responsive Design** - Mobile-friendly

## 🔒 Security Features

- **Session-based Authentication** - Secure server-side sessions
- **Authentication Middleware** - Protected API routes
- **Input Validation** - Form validation on client and server
- **File Upload Security** - Image type and size validation
- **CORS Configuration** - Proper cross-origin setup
- **XSS Protection** - Safe data handling

## 🎨 Design Features

- **Modern UI/UX** - Clean, professional design
- **Responsive Layout** - Works on all devices
- **Loading States** - Better user experience
- **Error Handling** - User-friendly error messages
- **Image Modals** - Click to view full-size images
- **Card-based Layout** - Modern post display
- **Gradient Effects** - Beautiful visual elements

## 📱 Mobile Responsive

The website is fully responsive and works perfectly on:
- **Desktop** (1200px+)
- **Tablet** (768px - 1199px)
- **Mobile** (320px - 767px)

## 🚧 Troubleshooting

### Common Issues:

1. **MongoDB Connection Error**
   ```bash
   # Start MongoDB service
   mongod

   # Check if MongoDB is running on port 27017
   mongo --eval "db.runCommand({connectionStatus : 1})"
   ```

2. **Port Already in Use**
   ```bash
   # Kill process using port 3000
   lsof -ti:3000 | xargs kill -9

   # Or change port in server.js
   const PORT = 3001;
   ```

3. **Session Issues**
   - Clear browser cookies and localStorage
   - Restart the server
   - Check if express-session is installed

4. **File Upload Issues**
   - Ensure `uploads/` directory exists
   - Check file permissions
   - Verify file size limits (5MB per image)

## 🧪 Testing

### Manual Testing Checklist:

- [ ] User can register with valid information
- [ ] User can login with correct credentials  
- [ ] User is redirected to dashboard after login
- [ ] Profile page shows real user data
- [ ] User can create posts with images
- [ ] My Posts page shows only user's posts
- [ ] User can logout successfully
- [ ] Authentication protects sensitive pages
- [ ] Image uploads work correctly
- [ ] Mobile responsive design works

## 🔧 Development

### Adding New Features:

1. **New API Endpoint:**
   ```javascript
   app.get('/api/new-endpoint', requireAuth, async (req, res) => {
     // Your code here
   });
   ```

2. **New Database Model:**
   ```javascript
   const newSchema = new mongoose.Schema({
     // Define schema
   });
   const NewModel = mongoose.model('NewModel', newSchema);
   ```

3. **New Frontend Page:**
   - Create HTML file
   - Add authentication check
   - Include in navigation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🎉 Success!

Your flatmate finder website is now fully functional with:

✅ User authentication and sessions  
✅ Profile management with real data  
✅ Post creation and management  
✅ Image uploads  
✅ Mobile responsive design  
✅ Modern UI/UX  
✅ Security features  
✅ Error handling  

**Happy flatmate finding! 🏠🤝**

---

For support or questions, please check the troubleshooting section or create an issue.
