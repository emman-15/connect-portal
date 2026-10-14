const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { pool, initDb, isDbConnected } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'portal-super-secret-key-change-in-prod';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
if (fs.existsSync(path.join(__dirname, 'connect-portal', 'public'))) {
    app.use(express.static(path.join(__dirname, 'connect-portal', 'public')));
}
if (fs.existsSync(path.join(__dirname, 'connect-portal'))) {
    app.use(express.static(path.join(__dirname, 'connect-portal')));
}

// In-Memory Fallback Store (Used if DATABASE_URL is not yet configured)
const memoryStore = {
    users: [
        {
            id: 1,
            first_name: 'Emman',
            last_name: 'Connect',
            email: 'emman@connect.com',
            password_hash: bcrypt.hashSync('password123', 10),
            birthday: '2000-01-15',
            gender: 'Male',
            coins: 1000,
            is_verified: true,
            created_at: new Date()
        }
    ],
    posts: [
        {
            id: 1,
            user_id: 1,
            author_name: 'Connect Portal Team',
            author_email: 'admin@connect.com',
            content: '🎉 Maligayang pagdating sa Connect Portal! Naka-deploy na ito gamit ang Render, GitHub, at Neon PostgreSQL. Subukan mag-post at mag-register!',
            mood: '🚀 Excited',
            created_at: new Date(),
            likes: [1],
            comments: [
                {
                    id: 1,
                    author_name: 'Sarah Dela Cruz',
                    text: 'Live na siya online! Fast loading and mobile friendly!',
                    created_at: new Date()
                }
            ]
        }
    ]
};

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired session token.' });
        }
        req.user = user;
        next();
    });
}

// Optional Auth (For public feeds that still check if user liked a post)
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (!err) req.user = user;
            next();
        });
    } else {
        next();
    }
}

/* ==================== SYSTEM STATUS ==================== */
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        database: isDbConnected() ? 'connected' : 'fallback-memory',
        provider: 'Neon PostgreSQL',
        platform: 'Render',
        timestamp: new Date().toISOString()
    });
});

/* ==================== AUTHENTICATION ROUTES ==================== */

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password, birthday, gender } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ error: 'Mangyaring punan ang lahat ng kinakailangang field.' });
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (isDbConnected()) {
            const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
            if (userCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Mayroon nang account gamit ang email na ito.' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const result = await pool.query(
                `INSERT INTO users (first_name, last_name, email, password_hash, birthday, gender, coins, is_verified)
                 VALUES ($1, $2, $3, $4, $5, $6, 1000, false)
                 RETURNING id, first_name, last_name, email, birthday, gender, coins, is_verified, created_at`,
                [firstName.trim(), lastName.trim(), normalizedEmail, passwordHash, birthday, gender]
            );

            const newUser = result.rows[0];
            const token = jwt.sign(
                { id: newUser.id, email: newUser.email, name: `${newUser.first_name} ${newUser.last_name}` },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.status(201).json({
                message: 'Naka-register ka na! May verification code na ipinadala sa iyong email.',
                token,
                user: newUser,
                verificationCode: '123456'
            });
        } else {
            // Memory fallback
            const exists = memoryStore.users.some(u => u.email === normalizedEmail);
            if (exists) {
                return res.status(400).json({ error: 'Mayroon nang account gamit ang email na ito.' });
            }

            const newUser = {
                id: memoryStore.users.length + 1,
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                email: normalizedEmail,
                password_hash: await bcrypt.hash(password, 10),
                birthday,
                gender,
                coins: 1000,
                is_verified: false,
                created_at: new Date()
            };
            memoryStore.users.push(newUser);

            const token = jwt.sign(
                { id: newUser.id, email: newUser.email, name: `${newUser.first_name} ${newUser.last_name}` },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.status(201).json({
                message: 'Naka-register ka na! May verification code na ipinadala sa iyong email.',
                token,
                user: {
                    id: newUser.id,
                    first_name: newUser.first_name,
                    last_name: newUser.last_name,
                    email: newUser.email,
                    birthday: newUser.birthday,
                    gender: newUser.gender,
                    coins: 1000,
                    is_verified: false
                },
                verificationCode: '123456'
            });
        }
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email/username at password ay kinakailangan.' });
        }

        const normalizedEmail = email.trim().toLowerCase();

        let user = null;
        if (isDbConnected()) {
            const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
            user = result.rows[0];
        } else {
            user = memoryStore.users.find(u => u.email === normalizedEmail);
        }

        if (!user) {
            return res.status(400).json({ error: 'Maling email o password.' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Maling email o password.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: `${user.first_name} ${user.last_name}` },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                birthday: user.birthday,
                gender: user.gender,
                coins: user.coins !== undefined ? user.coins : 1000,
                is_verified: user.is_verified === true
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// Demo Login
app.post('/api/auth/demo', async (req, res) => {
    try {
        const demoEmail = 'emman@connect.com';
        let user = null;

        if (isDbConnected()) {
            let result = await pool.query('SELECT * FROM users WHERE email = $1', [demoEmail]);
            if (result.rows.length === 0) {
                const passwordHash = await bcrypt.hash('password123', 10);
                const inserted = await pool.query(
                    `INSERT INTO users (first_name, last_name, email, password_hash, birthday, gender, coins, is_verified)
                     VALUES ('Emman', 'Connect', $1, $2, '2000-01-15', 'Male', 1000, true)
                     RETURNING id, first_name, last_name, email, birthday, gender, coins, is_verified`,
                    [demoEmail, passwordHash]
                );
                user = inserted.rows[0];
            } else {
                user = result.rows[0];
            }
        } else {
            user = memoryStore.users[0];
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: `${user.first_name} ${user.last_name}` },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Demo login active',
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                birthday: user.birthday,
                gender: user.gender,
                coins: user.coins !== undefined ? user.coins : 1000,
                is_verified: true
            }
        });
    } catch (err) {
        console.error('Demo login error:', err);
        res.status(500).json({ error: 'Failed to authenticate demo user.' });
    }
});

// Current User profile verification
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        if (isDbConnected()) {
            const result = await pool.query(
                'SELECT id, first_name, last_name, email, birthday, gender, COALESCE(coins, 1000) AS coins, COALESCE(is_verified, false) AS is_verified FROM users WHERE id = $1',
                [req.user.id]
            );
            if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
            return res.json({ user: result.rows[0] });
        } else {
            const user = memoryStore.users.find(u => u.id === req.user.id);
            if (!user) return res.status(404).json({ error: 'User not found.' });
            return res.json({
                user: {
                    id: user.id,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                    birthday: user.birthday,
                    gender: user.gender,
                    coins: user.coins !== undefined ? user.coins : 1000,
                    is_verified: user.is_verified === true
                }
            });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user data.' });
    }
});

// Verify Email
app.post('/api/auth/verify-email', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }
        if (!code) {
            return res.status(400).json({ error: 'Pakilagay ang 6-digit verification code.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const cleanCode = String(code).trim();

        if (cleanCode.length !== 6) {
            return res.status(400).json({ error: 'Ang verification code ay dapat 6 digits (halimbawa: 123456).' });
        }

        if (isDbConnected()) {
            const result = await pool.query(
                `UPDATE users 
                 SET is_verified = true 
                 WHERE email = $1 
                 RETURNING id, first_name, last_name, email, birthday, gender, coins, is_verified`,
                [normalizedEmail]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'User account not found.' });
            }

            const updatedUser = result.rows[0];
            const token = jwt.sign(
                { id: updatedUser.id, email: updatedUser.email, name: `${updatedUser.first_name} ${updatedUser.last_name}` },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json({
                message: 'Tagumpay! Na-verify na ang iyong email account.',
                token,
                user: updatedUser
            });
        } else {
            const user = memoryStore.users.find(u => u.email === normalizedEmail);
            if (!user) {
                return res.status(404).json({ error: 'User account not found.' });
            }

            user.is_verified = true;
            const token = jwt.sign(
                { id: user.id, email: user.email, name: `${user.first_name} ${user.last_name}` },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.json({
                message: 'Tagumpay! Na-verify na ang iyong email account.',
                token,
                user: {
                    id: user.id,
                    first_name: user.first_name,
                    last_name: user.last_name,
                    email: user.email,
                    birthday: user.birthday,
                    gender: user.gender,
                    coins: user.coins !== undefined ? user.coins : 1000,
                    is_verified: true
                }
            });
        }
    } catch (err) {
        console.error('Email verification error:', err);
        res.status(500).json({ error: 'Server error during email verification.' });
    }
});

// Resend verification code
app.post('/api/auth/resend-code', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }
        res.json({
            message: `Bagong 6-digit verification code naipadala sa ${email}: 123456`,
            code: '123456'
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to resend code.' });
    }
});

/* ==================== POSTS & FEED ROUTES ==================== */

// Get all posts
app.get('/api/posts', optionalAuth, async (req, res) => {
    try {
        const currentUserId = req.user ? req.user.id : null;

        if (isDbConnected()) {
            const query = `
                SELECT 
                    p.id, 
                    p.user_id, 
                    p.author_name, 
                    p.author_email, 
                    p.content, 
                    p.mood, 
                    p.created_at,
                    COUNT(DISTINCT l.id)::int AS likes_count,
                    COALESCE(BOOL_OR(l.user_id = $1), false) AS user_liked,
                    COALESCE(
                        JSON_AGG(
                            DISTINCT JSONB_BUILD_OBJECT(
                                'id', c.id,
                                'author', c.author_name,
                                'text', c.text,
                                'created_at', c.created_at
                            )
                        ) FILTER (WHERE c.id IS NOT NULL), '[]'
                    ) AS comments
                FROM posts p
                LEFT JOIN likes l ON p.id = l.post_id
                LEFT JOIN comments c ON p.id = c.post_id
                GROUP BY p.id
                ORDER BY p.created_at DESC
                LIMIT 50;
            `;

            const result = await pool.query(query, [currentUserId]);
            return res.json({ posts: result.rows });
        } else {
            // Memory fallback
            const posts = memoryStore.posts.map(p => ({
                id: p.id,
                user_id: p.user_id,
                author_name: p.author_name,
                author_email: p.author_email,
                content: p.content,
                mood: p.mood,
                created_at: p.created_at,
                likes_count: p.likes ? p.likes.length : 0,
                user_liked: currentUserId && p.likes ? p.likes.includes(currentUserId) : false,
                comments: p.comments || []
            }));

            posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            return res.json({ posts });
        }
    } catch (err) {
        console.error('Fetch posts error:', err);
        res.status(500).json({ error: 'Failed to retrieve posts.' });
    }
});

// Create post
app.post('/api/posts', authenticateToken, async (req, res) => {
    try {
        const { content, mood } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Post content cannot be empty.' });
        }

        if (isDbConnected()) {
            const result = await pool.query(
                `INSERT INTO posts (user_id, author_name, author_email, content, mood)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING *`,
                [req.user.id, req.user.name, req.user.email, content.trim(), mood || '😊 Feeling Good']
            );

            const newPost = result.rows[0];
            return res.status(201).json({
                message: 'Post created!',
                post: {
                    ...newPost,
                    likes_count: 0,
                    user_liked: false,
                    comments: []
                }
            });
        } else {
            const newPost = {
                id: Date.now(),
                user_id: req.user.id,
                author_name: req.user.name,
                author_email: req.user.email,
                content: content.trim(),
                mood: mood || '😊 Feeling Good',
                created_at: new Date(),
                likes: [],
                comments: []
            };
            memoryStore.posts.unshift(newPost);
            return res.status(201).json({
                message: 'Post created!',
                post: {
                    ...newPost,
                    likes_count: 0,
                    user_liked: false
                }
            });
        }
    } catch (err) {
        console.error('Create post error:', err);
        res.status(500).json({ error: 'Failed to create post.' });
    }
});

// Toggle Like
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
    try {
        const postId = parseInt(req.params.id, 10);
        const userId = req.user.id;

        if (isDbConnected()) {
            const existing = await pool.query(
                'SELECT id FROM likes WHERE post_id = $1 AND user_id = $2',
                [postId, userId]
            );

            let liked = false;
            if (existing.rows.length > 0) {
                await pool.query('DELETE FROM likes WHERE post_id = $1 AND user_id = $2', [postId, userId]);
                liked = false;
            } else {
                await pool.query('INSERT INTO likes (post_id, user_id) VALUES ($1, $2)', [postId, userId]);
                liked = true;
            }

            const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM likes WHERE post_id = $1', [postId]);
            return res.json({ liked, likes_count: countResult.rows[0].count });
        } else {
            const post = memoryStore.posts.find(p => p.id === postId);
            if (!post) return res.status(404).json({ error: 'Post not found.' });

            if (!post.likes) post.likes = [];
            const idx = post.likes.indexOf(userId);
            let liked = false;

            if (idx > -1) {
                post.likes.splice(idx, 1);
                liked = false;
            } else {
                post.likes.push(userId);
                liked = true;
            }

            return res.json({ liked, likes_count: post.likes.length });
        }
    } catch (err) {
        console.error('Like error:', err);
        res.status(500).json({ error: 'Failed to update like.' });
    }
});

// Add Comment
app.post('/api/posts/:id/comment', authenticateToken, async (req, res) => {
    try {
        const postId = parseInt(req.params.id, 10);
        const { text } = req.body;

        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Comment text cannot be empty.' });
        }

        if (isDbConnected()) {
            const result = await pool.query(
                `INSERT INTO comments (post_id, user_id, author_name, text)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, author_name AS author, text, created_at`,
                [postId, req.user.id, req.user.name, text.trim()]
            );

            return res.status(201).json({ comment: result.rows[0] });
        } else {
            const post = memoryStore.posts.find(p => p.id === postId);
            if (!post) return res.status(404).json({ error: 'Post not found.' });

            const newComment = {
                id: Date.now(),
                author: req.user.name,
                text: text.trim(),
                created_at: new Date()
            };

            if (!post.comments) post.comments = [];
            post.comments.push(newComment);

            return res.status(201).json({ comment: newComment });
        }
    } catch (err) {
        console.error('Comment error:', err);
        res.status(500).json({ error: 'Failed to add comment.' });
    }
});

// Delete Post
app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
    try {
        const postId = parseInt(req.params.id, 10);

        if (isDbConnected()) {
            const postCheck = await pool.query('SELECT user_id, author_email FROM posts WHERE id = $1', [postId]);
            if (postCheck.rows.length === 0) {
                return res.status(404).json({ error: 'Post not found.' });
            }

            const post = postCheck.rows[0];
            if (post.user_id !== req.user.id && post.author_email !== req.user.email) {
                return res.status(403).json({ error: 'You are only allowed to delete your own posts.' });
            }

            await pool.query('DELETE FROM posts WHERE id = $1', [postId]);
            return res.json({ message: 'Post deleted successfully.' });
        } else {
            const idx = memoryStore.posts.findIndex(p => p.id === postId);
            if (idx === -1) return res.status(404).json({ error: 'Post not found.' });

            const post = memoryStore.posts[idx];
            if (post.user_id !== req.user.id && post.author_email !== req.user.email) {
                return res.status(403).json({ error: 'You are only allowed to delete your own posts.' });
            }

            memoryStore.posts.splice(idx, 1);
            return res.json({ message: 'Post deleted successfully.' });
        }
    } catch (err) {
        console.error('Delete post error:', err);
        res.status(500).json({ error: 'Failed to delete post.' });
    }
});

// ==================== VIRTUAL ARCADE GAME ROUTES ====================

// Get user virtual coins wallet
app.get('/api/game/wallet', authenticateToken, async (req, res) => {
    try {
        let coins = 1000;
        if (isDbConnected()) {
            const result = await pool.query('SELECT COALESCE(coins, 1000) AS coins FROM users WHERE id = $1', [req.user.id]);
            if (result.rows.length > 0) coins = result.rows[0].coins;
        } else {
            const user = memoryStore.users.find(u => u.id === req.user.id);
            if (user) coins = user.coins !== undefined ? user.coins : 1000;
        }
        res.json({ coins });
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve wallet balance.' });
    }
});

// Free Coin Refill / Daily Bonus
app.post('/api/game/claim-refill', authenticateToken, async (req, res) => {
    try {
        const bonus = 250;
        let newCoins = 1000;

        if (isDbConnected()) {
            const result = await pool.query(
                'UPDATE users SET coins = COALESCE(coins, 1000) + $1 WHERE id = $2 RETURNING coins',
                [bonus, req.user.id]
            );
            newCoins = result.rows[0].coins;
        } else {
            const user = memoryStore.users.find(u => u.id === req.user.id);
            if (user) {
                user.coins = (user.coins || 1000) + bonus;
                newCoins = user.coins;
            }
        }

        res.json({ message: `Nakatanggap ka ng +${bonus} Free Virtual Coins!`, coins: newCoins });
    } catch (err) {
        res.status(500).json({ error: 'Failed to claim free coins.' });
    }
});

// Dice Roll Game (Low, Lucky 7, High)
app.post('/api/game/dice', authenticateToken, async (req, res) => {
    try {
        const { bet, prediction } = req.body;
        const betAmount = parseInt(bet, 10);

        if (!betAmount || betAmount < 10) {
            return res.status(400).json({ error: 'Minimum bet is 10 virtual coins.' });
        }
        if (!['low', 'lucky7', 'high'].includes(prediction)) {
            return res.status(400).json({ error: 'Invalid prediction. Choose low (2-6), lucky7 (7), or high (8-12).' });
        }

        let currentCoins = 1000;
        if (isDbConnected()) {
            const u = await pool.query('SELECT COALESCE(coins, 1000) AS coins FROM users WHERE id = $1', [req.user.id]);
            if (u.rows.length === 0) return res.status(404).json({ error: 'User not found' });
            currentCoins = u.rows[0].coins;
        } else {
            const u = memoryStore.users.find(user => user.id === req.user.id);
            currentCoins = u ? (u.coins || 0) : 0;
        }

        if (currentCoins < betAmount) {
            return res.status(400).json({ error: 'Kulang ang iyong virtual coins. I-click ang Claim Free Coins!' });
        }

        // Roll 2 dice
        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;
        const total = die1 + die2;

        let won = false;
        let payout = 0;

        if (prediction === 'low' && total >= 2 && total <= 6) {
            won = true;
            payout = betAmount * 2;
        } else if (prediction === 'lucky7' && total === 7) {
            won = true;
            payout = betAmount * 4; // Lucky 7 pays 4x
        } else if (prediction === 'high' && total >= 8 && total <= 12) {
            won = true;
            payout = betAmount * 2;
        }

        const netChange = won ? (payout - betAmount) : -betAmount;
        let finalCoins = currentCoins + netChange;

        if (isDbConnected()) {
            await pool.query('UPDATE users SET coins = $1 WHERE id = $2', [finalCoins, req.user.id]);
        } else {
            const u = memoryStore.users.find(user => user.id === req.user.id);
            if (u) u.coins = finalCoins;
        }

        res.json({
            die1,
            die2,
            total,
            prediction,
            won,
            payout,
            coins: finalCoins,
            message: won ? `🎉 Panalo! Lumabas ang ${total}. Nanalo ka ng ${payout} virtual coins!` : `Lumabas ang ${total}. Bawi sa susunod na roll! (-${betAmount} coins)`
        });
    } catch (err) {
        console.error('Dice game error:', err);
        res.status(500).json({ error: 'Dice game calculation error.' });
    }
});

// Lucky Wheel Spin
app.post('/api/game/wheel', authenticateToken, async (req, res) => {
    try {
        const cost = 50;
        let currentCoins = 1000;

        if (isDbConnected()) {
            const u = await pool.query('SELECT COALESCE(coins, 1000) AS coins FROM users WHERE id = $1', [req.user.id]);
            if (u.rows.length === 0) return res.status(404).json({ error: 'User not found' });
            currentCoins = u.rows[0].coins;
        } else {
            const u = memoryStore.users.find(user => user.id === req.user.id);
            currentCoins = u ? (u.coins || 0) : 0;
        }

        if (currentCoins < cost) {
            return res.status(400).json({ error: 'Kailangan ng 50 coins para makapag-spin. Mag-claim ng Free Coins!' });
        }

        // 8 slices: 100, 0, 250, 50, 0, 500, 150, 1000
        const slices = [100, 0, 250, 50, 0, 500, 150, 1000];
        const sliceIndex = Math.floor(Math.random() * slices.length);
        const prize = slices[sliceIndex];
        const won = prize > 0;

        const netChange = prize - cost;
        const finalCoins = currentCoins + netChange;

        if (isDbConnected()) {
            await pool.query('UPDATE users SET coins = $1 WHERE id = $2', [finalCoins, req.user.id]);
        } else {
            const u = memoryStore.users.find(user => user.id === req.user.id);
            if (u) u.coins = finalCoins;
        }

        res.json({
            sliceIndex,
            prize,
            won,
            cost,
            coins: finalCoins,
            message: won ? `🎉 Wow! Napanalunan mo ang ${prize} virtual coins!` : 'Walang napanalunan, subukan ulit!'
        });
    } catch (err) {
        console.error('Wheel game error:', err);
        res.status(500).json({ error: 'Wheel game calculation error.' });
    }
});

// Coin Flip
app.post('/api/game/coinflip', authenticateToken, async (req, res) => {
    try {
        const { bet, choice } = req.body;
        const betAmount = parseInt(bet, 10);

        if (!betAmount || betAmount < 10) {
            return res.status(400).json({ error: 'Minimum bet is 10 coins.' });
        }
        if (!['heads', 'tails'].includes(choice)) {
            return res.status(400).json({ error: 'Pumili sa Heads o Tails.' });
        }

        let currentCoins = 1000;
        if (isDbConnected()) {
            const u = await pool.query('SELECT COALESCE(coins, 1000) AS coins FROM users WHERE id = $1', [req.user.id]);
            if (u.rows.length === 0) return res.status(404).json({ error: 'User not found' });
            currentCoins = u.rows[0].coins;
        } else {
            const u = memoryStore.users.find(user => user.id === req.user.id);
            currentCoins = u ? (u.coins || 0) : 0;
        }

        if (currentCoins < betAmount) {
            return res.status(400).json({ error: 'Kulang ang iyong virtual coins.' });
        }

        const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = outcome === choice;
        const payout = won ? betAmount * 2 : 0;
        const netChange = won ? betAmount : -betAmount;
        const finalCoins = currentCoins + netChange;

        if (isDbConnected()) {
            await pool.query('UPDATE users SET coins = $1 WHERE id = $2', [finalCoins, req.user.id]);
        } else {
            const u = memoryStore.users.find(user => user.id === req.user.id);
            if (u) u.coins = finalCoins;
        }

        res.json({
            outcome,
            choice,
            won,
            payout,
            coins: finalCoins,
            message: won ? `🎉 Galing! Lumabas ang ${outcome.toUpperCase()}! Nanalo ka ng ${payout} coins!` : `Lumabas ang ${outcome.toUpperCase()}. Bawi ulit!`
        });
    } catch (err) {
        res.status(500).json({ error: 'Coin flip error.' });
    }
});

// Game Leaderboard
app.get('/api/game/leaderboard', async (req, res) => {
    try {
        if (isDbConnected()) {
            const result = await pool.query(
                `SELECT id, first_name, last_name, COALESCE(coins, 1000) AS coins 
                 FROM users 
                 ORDER BY coins DESC 
                 LIMIT 10`
            );
            res.json({ leaderboard: result.rows });
        } else {
            const list = memoryStore.users.map(u => ({
                id: u.id,
                first_name: u.first_name,
                last_name: u.last_name,
                coins: u.coins || 1000
            })).sort((a, b) => b.coins - a.coins);
            res.json({ leaderboard: list.slice(0, 10) });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
});

// SPA Fallback for any other route
app.get('*', (req, res) => {
    const candidates = [
        path.join(__dirname, 'public', 'index.html'),
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'emman.html'),
        path.join(__dirname, 'public', 'emman.html'),
        path.join(__dirname, 'connect-portal', 'public', 'index.html'),
        path.join(__dirname, 'connect-portal', 'index.html'),
        path.join(__dirname, 'connect-portal', 'emman.html')
    ];

    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) {
            return res.sendFile(filePath);
        }
    }

    res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Connect Portal - Setup Notice</title><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 40px; background: #f0f2f5;">
            <div style="max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <h2 style="color: #1877f2;">Connect Portal</h2>
                <p>Naka-deploy na ang iyong server sa Render! 🚀</p>
                <p style="color: #65676b;">Ngunit hindi pa nakikita ang <code>index.html</code> sa tamang folder ng iyong GitHub repository.</p>
                <div style="text-align: left; background: #f8f9fa; padding: 12px; border-radius: 6px; font-size: 13px;">
                    <strong>Mga file na natagpuan sa server:</strong><br>
                    ${JSON.stringify(fs.readdirSync(__dirname))}
                </div>
                <p style="margin-top: 15px; font-size: 13px;">Pakisiguradong mai-upload ang <code>index.html</code> (o ang folder na <code>public</code>) sa iyong GitHub repository.</p>
            </div>
        </body>
        </html>
    `);
});

// Start Server
async function start() {
    await initDb();
    app.listen(PORT, () => {
        console.log(`🚀 Connect Portal running on port ${PORT}`);
        console.log(`🌐 Ready for Render, Safari, and Google Chrome`);
    });
}

start();
