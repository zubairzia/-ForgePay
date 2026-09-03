const db = require('../db');
const { getCompanyPlan } = require('../middleware/plan.middleware');

const getSettings = async (req, res, next) => {
  try {
    const plan = await getCompanyPlan(req.tenantId);
    res.render('settings/index', { plan });
  } catch (error) {
    next(error);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    const { plan } = req.body;
    if (!['free', 'pro'].includes(plan)) {
      const err = new Error('Invalid plan');
      err.status = 400;
      throw err;
    }

    await db.query('UPDATE companies SET plan = $1 WHERE id = $2', [plan, req.tenantId]);
    res.redirect('/settings');
  } catch (error) {
    next(error);
  }
};

module.exports = { getSettings, updatePlan };
