const passport = require('passport');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = mongoose.model('User');
const promisify = require('es6-promisify');
const mail = require('../handlers/mail');

// local - use user email and password to login
exports.login = passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: 'Failed Login',
    successRedirect: '/',
    successFlash: 'You are logged in'
});

exports.logout = (req, res) => {
    req.logout();
    req.flash('success', 'You are now logged out!');
    res.redirect('/');
};

exports.isLoggedIn = (req, res, next) => {
    // first check if the user is authenticated
    if (req.isAuthenticated()) {
        next(); // carry on, logged in
        return;
    }
    req.flash('error', 'You must be logged in to do this');
    res.redirect('/login');
};

exports.forgot = async (req, res) => {
    // 1. See if a user with that email exists
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
        req.flash('error', 'No account with that email exists');
        return res.redirect('/login');
    }

    // 2. Set reset tokens and expiry on their account
    user.resetPasswordToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now
    await user.save();

    // 3. Send them an email with the token
    const resetURL = `http://${req.headers.host}/account/reset/${user.resetPasswordToken}`;
    // req.flash('success', `You have been emailed a password reset link. ${resetURL}`);

    await mail.send({
        user: user,
        subject: 'Password Reset',
        filename: 'password-reset',
        resetURL
    });
    req.flash('success', `You have been emailed a password reset link.`);

    // 4. redirect to login page
    res.redirect('/login');

};

exports.reset = async (req, res) => {
    const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) {
        req.flash('error', 'Password reset is invalid or has expired');
        return res.redirect('/login');
    }

    // if there is a user, show the rest password form
    res.render('reset', { title: 'Reset your Password' });
};

exports.confirmedPassword = (req, res, next) => {
    if (req.body.password === req.body['password-confirm']) {
        next(); // keep it going
        return;
    }

    req.flash('error', 'Passwords do not match');
    res.redirect('back');
};

// Update (reset) password
exports.update = async (req, res) => {
    const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) {
        req.flash('error', 'Password reset is invalid or has expired');
        return res.redirect('/login');
    }

    // the setPassword method is made accessable from the plugin
    const setPassword = promisify(user.setPassword, user);
    await setPassword(req.body.password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    const updatedUser = await user.save(); // save
    await req.login(updatedUser); // and log the user in

    req.flash('success', 'Your password has been reset. You are now logged in.');
    res.redirect('/');
};
