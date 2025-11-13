
// Authentication and form handling for post-requirement.html

// Check authentication when page loads
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch('/api/user', {
            method: 'GET',
            credentials: 'include'
        });
        const data = await response.json();

        if (!data.success || !data.loggedIn) {
            alert('Please log in to post requirements');
            window.location.href = 'login.html';
            return;
        }

        // User is authenticated, show their name if available
        if (data.userName) {
            const userInfo = document.createElement('div');
            userInfo.style.cssText = 'background: #e8f5e8; padding: 10px; border-radius: 8px; margin-bottom: 20px; text-align: center; color: #2e7d32; font-weight: bold;';
            userInfo.innerHTML = `✅ Posting as: ${data.userName}`;
            const form = document.querySelector('.flatmate-form');
            if (form) {
                form.insertBefore(userInfo, form.firstChild.nextSibling);
            }
        }

    } catch (error) {
        console.error('Auth check error:', error);
        alert('Please log in to post requirements');
        window.location.href = 'login.html';
    }
});

// Form submission handler
document.addEventListener('DOMContentLoaded', function() {
    const form = document.querySelector('.flatmate-form');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn ? submitBtn.textContent : 'Submit';

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Posting...';
            submitBtn.style.background = '#888';
        }

        try {
            // Check authentication again before submitting
            const authResponse = await fetch('/api/user', {
                method: 'GET',
                credentials: 'include'
            });
            const authData = await authResponse.json();

            if (!authData.success || !authData.loggedIn) {
                alert('Session expired. Please log in again.');
                window.location.href = 'login.html';
                return;
            }

            // Create FormData from the form
            const formData = new FormData(form);

            // Submit to the API endpoint
            const response = await fetch('/api/post-requirement', {
                method: 'POST',
                credentials: 'include', // Important for session authentication
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                alert('✅ Requirement posted successfully!\n\nYou can view it in "My Posts" section.');
                // Redirect to my posts page to see the new post
                window.location.href = 'my-posts.html';
            } else {
                alert('❌ Error posting requirement: ' + (result.message || 'Unknown error'));
            }

        } catch (error) {
            console.error('Submit error:', error);
            alert('❌ Error posting requirement. Please check your internet connection and try again.');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                submitBtn.style.background = '#4CAF50';
            }
        }
    });
});

// Add form validation
document.addEventListener('DOMContentLoaded', function() {
    const priceInput = document.getElementById('price');
    const imagesInput = document.getElementById('images');

    // Validate price input
    if (priceInput) {
        priceInput.addEventListener('input', function() {
            const value = parseInt(this.value);
            if (value < 0) {
                this.value = 0;
            }
            if (value > 1000000) {
                this.value = 1000000;
            }
        });
    }

    // Validate image uploads
    if (imagesInput) {
        imagesInput.addEventListener('change', function() {
            if (this.files.length > 3) {
                alert('You can upload maximum 3 images');
                this.value = '';
                return;
            }

            // Check file sizes (max 5MB per file)
            for (let i = 0; i < this.files.length; i++) {
                if (this.files[i].size > 5 * 1024 * 1024) {
                    alert('Each image must be less than 5MB');
                    this.value = '';
                    return;
                }
            }
        });
    }
});
