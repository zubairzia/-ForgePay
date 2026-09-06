const authService = require('../services/Auth/localService');

const usersPage = async (req, res, next) => {
  try {
    const users = await authService.listUsersForCompany(req.tenantId);
    res.render('settings/users', { users, roles: authService.ROLES, error: null, formValues: {} });
  } catch (error) {
    next(error);
  }
};

const submitInvite = async (req, res, next) => {
  try {
    await authService.inviteUser(req.tenantId, req.body);
    res.redirect('/settings/users');
  } catch (error) {
    if (error.status && error.status < 500) {
      const users = await authService.listUsersForCompany(req.tenantId);
      return res.status(error.status).render('settings/users', {
        users,
        roles: authService.ROLES,
        error: error.message,
        formValues: req.body,
      });
    }
    next(error);
  }
};

const submitSetActive = (isActive) => async (req, res, next) => {
  try {
    const user = await authService.setUserActive(req.tenantId, req.params.id, req.user.id, isActive);
    if (!user) {
      return res.status(404).render('settings/not-found', { userId: req.params.id });
    }
    res.redirect('/settings/users');
  } catch (error) {
    if (error.status && error.status < 500) {
      const users = await authService.listUsersForCompany(req.tenantId);
      return res.status(error.status).render('settings/users', {
        users,
        roles: authService.ROLES,
        error: error.message,
        formValues: {},
      });
    }
    next(error);
  }
};

const submitChangeRole = async (req, res, next) => {
  try {
    const user = await authService.changeUserRole(req.tenantId, req.params.id, req.user.id, req.body.role);
    if (!user) {
      return res.status(404).render('settings/not-found', { userId: req.params.id });
    }
    res.redirect('/settings/users');
  } catch (error) {
    if (error.status && error.status < 500) {
      const users = await authService.listUsersForCompany(req.tenantId);
      return res.status(error.status).render('settings/users', {
        users,
        roles: authService.ROLES,
        error: error.message,
        formValues: {},
      });
    }
    next(error);
  }
};

module.exports = {
  usersPage,
  submitInvite,
  submitDeactivate: submitSetActive(false),
  submitReactivate: submitSetActive(true),
  submitChangeRole,
};
