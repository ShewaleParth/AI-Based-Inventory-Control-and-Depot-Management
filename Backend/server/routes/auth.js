// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
  isRefreshTokenValid,
  REFRESH_COOKIE_OPTIONS
} = require('../utils/jwt');
const { sendOTPEmail, sendPasswordResetEmail } = require('../services/emailService');
const { validate, signupSchema, loginSchema } = require('../middleware/validation');
const { authLimiter } = require('../middleware/security');
const DepotAssignment = require('../models/DepotAssignment');

// Helper: generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Helper: fetch assigned depots for a user
async function getAssignedDepots(userId) {
  try {
    const assignments = await DepotAssignment.find({ userId })
      .populate('depotId', 'name location');
    return assignments.map(a => ({
      depotId: a.depotId?._id || a.depotId,
      depotName: a.depotId?.name || 'Unknown',
      permissions: a.permissions
    }));
  } catch {
    return [];
  }
}

/**
 * Helper: issue both tokens and set the refresh cookie.
 * Call after any successful authentication event.
 */
async function issueTokens(res, userId) {
  const accessToken = generateAccessToken(userId);
  const { token: refreshToken, jti } = generateRefreshToken(userId);
  await storeRefreshToken(userId, jti);
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
  return accessToken;
}

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

/**
 * @route   POST /api/auth/signup
 * @desc    Register new user with email verification
 * @access  Public
 */
router.post('/signup', authLimiter, validate(signupSchema), async (req, res) => {
  try {
    const { first_name, last_name, email, password, organizationName } = req.body;

    // Check if user already exists
    const existingUser = await req.app.locals.User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        message: 'User with this email already exists'
      });
    }

    // Hash password with bcrypt (salt rounds: 12 for security)
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create new user as admin (self-registered users are org owners)
    const newUser = new req.app.locals.User({
      first_name,
      last_name,
      email: email.toLowerCase(),
      password: hashedPassword,
      isVerified: false,
      otp,
      otpExpiry,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Set organizationId to self (this user is the org owner)
    newUser.organizationId = newUser._id;

    await newUser.save();

    // Send OTP email
    const emailResult = await sendOTPEmail(email, otp, first_name);
    
    if (!emailResult.success) {
      console.warn('OTP email failed, but user created. OTP:', otp);
    }

    res.status(201).json({
      message: 'User registered successfully. Please verify your email with the OTP sent.',
      userId: newUser._id,
      email: newUser.email,
      requiresVerification: true,
      // In development, include OTP in response if email fails
      ...(process.env.NODE_ENV === 'development' && !emailResult.success && { otp })
    });

  } catch (error) {
    console.error('Signup error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'User with this email already exists'
      });
    }

    res.status(500).json({
      message: 'Error creating user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify email with OTP
 * @access  Public
 */
router.post('/verify-otp', authLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await req.app.locals.User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    // Check OTP expiry
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    // Verify OTP
    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Mark user as verified
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Generate access + refresh tokens
    const accessToken = await issueTokens(res, user._id);

    // Get assigned depots for this user
    let assignedDepots = [];
    try {
      const DepotAssignment = require('../models/DepotAssignment');
      const assignments = await DepotAssignment.find({ userId: user._id })
        .populate('depotId', 'name location');
      assignedDepots = assignments.map(a => ({
        depotId: a.depotId?._id || a.depotId,
        depotName: a.depotId?.name || 'Unknown',
        permissions: a.permissions
      }));
    } catch (depotErr) {
      console.warn('Could not fetch depot assignments:', depotErr.message);
    }

    res.json({
      message: 'Email verified successfully',
      token: accessToken,
      user: {
        id: user._id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        organizationId: user.organizationId || user._id,
        assignedDepots
      }
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Error verifying OTP' });
  }
});

/**
 * @route   POST /api/auth/resend-otp
 * @desc    Resend OTP for email verification
 * @access  Public
 */
router.post('/resend-otp', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await req.app.locals.User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Send OTP email
    const emailResult = await sendOTPEmail(email, otp, user.first_name);

    res.json({
      message: 'OTP sent successfully',
      ...(process.env.NODE_ENV === 'development' && !emailResult.success && { otp })
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Error resending OTP' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await req.app.locals.User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    // Check if email is verified
    if (!user.isVerified) {
      return res.status(403).json({
        message: 'Please verify your email before logging in',
        requiresVerification: true,
        email: user.email
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid email or password'
      });
    }

    // Generate access + refresh tokens
    const accessToken = await issueTokens(res, user._id);

    // Update last login
    user.updatedAt = new Date();
    await user.save();

    const assignedDepots = await getAssignedDepots(user._id);

    res.json({
      message: 'Login successful',
      token: accessToken,
      user: {
        id: user._id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        avatar: user.avatar,
        organizationId: user.organizationId || user._id,
        assignedDepots
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user info
 * @access  Private
 */
const authenticateToken = require('../middleware/auth');
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const user = await req.app.locals.User.findById(userId).select('-password -otp -otpExpiry');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const assignedDepots = await getAssignedDepots(user._id);

    res.json({
      user: {
        id: user._id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        avatar: user.avatar,
        createdAt: user.createdAt,
        organizationId: user.organizationId || user._id,
        assignedDepots
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Error fetching user data' });
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset OTP
 * @access  Public
 */
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await req.app.locals.User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists or not (security best practice)
      return res.json({
        message: 'If an account exists with this email, a password reset OTP has been sent'
      });
    }

    // Generate OTP for password reset
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    // Send OTP email
    await sendOTPEmail(email, otp, user.first_name);

    res.json({
      message: 'If an account exists with this email, a password reset OTP has been sent',
      ...(process.env.NODE_ENV === 'development' && { otp })
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error processing request' });
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with OTP
 * @access  Public
 */
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP, and new password are required' });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const user = await req.app.locals.User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check OTP expiry
    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    // Verify OTP
    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.updatedAt = new Date();
    await user.save();

    res.json({
      message: 'Password reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Silently exchange a valid refresh token for a new access token
 * @access  Public (uses httpOnly cookie)
 */
router.post('/refresh', async (req, res) => {
  console.log('[Auth] /refresh hit. Cookies present:', Object.keys(req.cookies || {}));
  try {
    const incomingRefresh = req.cookies?.refreshToken;

    if (!incomingRefresh) {
      console.log('[Auth] Refresh failed: No refreshToken cookie found');
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    // Verify the JWT signature
    const decoded = verifyRefreshToken(incomingRefresh);
    if (!decoded) {
      console.log('[Auth] Refresh failed: JWT signature verification failed');
      res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
      res.clearCookie('refreshToken', { path: '/api/v1/auth' }); // Force clear legacy Redis cookie
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const { userId, jti } = decoded;

    // Check MongoDB — token might have been revoked on logout
    const valid = await isRefreshTokenValid(userId, jti);
    if (!valid) {
      console.log('[Auth] Refresh failed: Token jti not found or expired in MongoDB (jti:', jti, ')');
      res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);
      res.clearCookie('refreshToken', { path: '/api/v1/auth' }); // Force clear legacy Redis cookie
      return res.status(401).json({ message: 'Session revoked. Please log in again.' });
    }

    // Rotate: revoke old refresh token, issue a new pair
    console.log('[Auth] Refresh successful for user:', userId);
    await revokeRefreshToken(userId, jti);
    const newAccessToken = await issueTokens(res, userId);

    res.json({ token: newAccessToken });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ message: 'Error refreshing token' });
  }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Revoke refresh token and clear cookie
 * @access  Public (refresh token in cookie)
 */
router.post('/logout', async (req, res) => {
  try {
    const incomingRefresh = req.cookies?.refreshToken;

    if (incomingRefresh) {
      const decoded = verifyRefreshToken(incomingRefresh);
      if (decoded?.userId && decoded?.jti) {
        await revokeRefreshToken(decoded.userId, decoded.jti);
      }
    }

    // Clear the cookie regardless
    res.clearCookie('refreshToken', { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
    res.clearCookie('refreshToken', { path: '/api/v1/auth' }); // Force clear legacy Redis cookie
    res.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    // Still clear the cookie even on error
    res.clearCookie('refreshToken', { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
    res.clearCookie('refreshToken', { path: '/api/v1/auth' }); // Force clear legacy Redis cookie
    res.json({ message: 'Logged out' });
  }
});

module.exports = router;
