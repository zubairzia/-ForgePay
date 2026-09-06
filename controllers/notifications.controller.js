const localService = require('../services/Notifications/localService');

const notificationsPage = async (req, res, next) => {
  try {
    const notifications = await localService.getNotifications(req.tenantId);
    res.render('settings/notifications', { notifications });
  } catch (error) {
    next(error);
  }
};

module.exports = { notificationsPage };
