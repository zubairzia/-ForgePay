const localService = require('../services/Dashboard/localService');

// GET dashboard summary
const getDashboardSummary = async (req, res, next) => {
  try {
    const summary = await localService.getDashboardSummary(req.tenantId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardSummary };
