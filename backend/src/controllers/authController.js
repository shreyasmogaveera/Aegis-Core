const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

class AuthController {
  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Find user in MongoDB
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials. User not found.' });
      }

      const isMatch = bcrypt.compareSync(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid credentials. Incorrect password.' });
      }

      if (!process.env.JWT_SECRET) {
        console.error('[FATAL] JWT_SECRET environment variable is not defined.');
        return res.status(500).json({ error: 'Server authentication configuration error' });
      }

      const tokenPayload = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.name
      };

      const accessToken = jwt.sign(
        tokenPayload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      let refreshToken = null;
      if (process.env.REFRESH_TOKEN_SECRET) {
        refreshToken = jwt.sign(
          tokenPayload,
          process.env.REFRESH_TOKEN_SECRET,
          { expiresIn: '7d' }
        );
      }

      return res.status(200).json({
        message: 'Login successful',
        token: accessToken,
        refreshToken: refreshToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          name: user.name,
          phone: user.phone || '',
          agency: user.agency || ''
        }
      });
    } catch (err) {
      console.error('[AuthController.login] Error:', err);
      return res.status(500).json({ error: 'Internal server error during login' });
    }
  }

  async register(req, res) {
    try {
      const { email, password, fullname, phone, role, agency } = req.body;

      if (!email || !password || !fullname) {
        return res.status(400).json({ error: 'Full name, email, and password are required' });
      }

      const cleanEmail = email.toLowerCase().trim();

      // Check existing user in MongoDB
      const existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser) {
        return res.status(400).json({ error: 'An account with this email already exists' });
      }

      // Default role to 'user'. Support 'admin' registration if explicit role parameter is provided by admin system/testing
      const userRole = (role === 'admin') ? 'admin' : 'user';

      const passwordHash = bcrypt.hashSync(password, 10);

      const newUser = await User.create({
        name: fullname,
        email: cleanEmail,
        passwordHash,
        role: userRole,
        phone: phone || '',
        agency: agency || ''
      });

      return res.status(201).json({
        message: 'Account created successfully',
        user: {
          id: newUser._id.toString(),
          email: newUser.email,
          role: newUser.role,
          name: newUser.name,
          phone: newUser.phone || '',
          agency: newUser.agency || ''
        }
      });
    } catch (err) {
      console.error('[AuthController.register] Error:', err);
      return res.status(500).json({ error: 'Internal server error during registration' });
    }
  }

  async getCurrentUser(req, res) {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const dbUser = await User.findById(req.user.userId).select('-passwordHash');
      if (!dbUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({
        user: {
          id: dbUser._id.toString(),
          email: dbUser.email,
          role: dbUser.role,
          name: dbUser.name,
          phone: dbUser.phone || '',
          agency: dbUser.agency || ''
        }
      });
    } catch (err) {
      console.error('[AuthController.getCurrentUser] Error:', err);
      return res.status(500).json({ error: 'Internal server error fetching user profile' });
    }
  }
}

module.exports = new AuthController();
