const authService = require('../services/Auth/localService');

const registerPage = (req, res) => {
  res.render('auth/register', { error: null, formValues: {} });
};

// Registers the company + owner, then logs them straight in -- they just
// became the owner of a brand-new company, there's no separate "confirm
// your email" step in this app to gate that on.
const submitRegister = async (req, res, next) => {
  try {
    const { company, user } = await authService.registerCompanyAndOwner(req.body);
    req.session.user = user;
    res.redirect('/');
  } catch (error) {
    if (error.status && error.status < 500) {
      return res.status(error.status).render('auth/register', {
        error: error.message,
        formValues: req.body,
      });
    }
    next(error);
  }
};

const loginPage = (req, res) => {
  res.render('auth/login', { error: null, formValues: {} });
};

const submitLogin = async (req, res, next) => {
  try {
    const user = await authService.login(req.body.email, req.body.password);
    req.session.user = user;
    res.redirect('/');
  } catch (error) {
    if (error.status && error.status < 500) {
      return res.status(error.status).render('auth/login', {
        error: error.message,
        formValues: { email: req.body.email },
      });
    }
    next(error);
  }
};

const logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
};

module.exports = { registerPage, submitRegister, loginPage, submitLogin, logout };
