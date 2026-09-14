const express = require('express');
const router  = express.Router();
const { applyLeave, getMyLeaves, cancelLeave } = require('../controllers/leave.controller');
const { authenticateEmployee } = require('../middleware/auth.middleware');

router.post('/apply',  authenticateEmployee, applyLeave);
router.get('/my',      authenticateEmployee, getMyLeaves);
router.patch('/:id/cancel', authenticateEmployee, cancelLeave);

module.exports = router;
