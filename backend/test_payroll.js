require('dotenv').config();
const db = require('./src/config/database');

async function test() {
  try {
    // Test 1: Can we query employees?
    const emps = await db.query("SELECT employee_id, full_name, base_salary FROM employees WHERE is_active=TRUE");
    console.log('Employees found:', emps.rows.length);
    emps.rows.forEach(e => console.log(' -', e.employee_id, e.full_name, 'salary:', e.base_salary));

    // Test 2: Does payroll_records table exist?
    const pr = await db.query("SELECT COUNT(*) FROM payroll_records");
    console.log('Payroll records:', pr.rows[0].count);

    // Test 3: Does payroll_items table exist?
    const pi = await db.query("SELECT COUNT(*) FROM payroll_items");
    console.log('Payroll items:', pi.rows[0].count);

    // Test 4: Does public_holidays table exist?
    const ph = await db.query("SELECT COUNT(*) FROM public_holidays");
    console.log('Holidays:', ph.rows[0].count);

    // Test 5: Try the holiday query used in generate
    const holidays = await db.query(
      "SELECT date FROM public_holidays WHERE EXTRACT(MONTH FROM date)= AND EXTRACT(YEAR FROM date)=",
      [9, 2026]
    );
    console.log('Holidays for Sep 2026:', holidays.rows.length);

    // Test 6: Try attendance summary query
    const att = await db.query(
      "SELECT COUNT(*) FILTER (WHERE status='present') AS present_days FROM attendance WHERE employee_id= AND EXTRACT(MONTH FROM date)= AND EXTRACT(YEAR FROM date)=",
      ['MKA-001', 9, 2026]
    );
    console.log('Attendance for MKA-001 Sep 2026:', JSON.stringify(att.rows[0]));

    process.exit(0);
  } catch(err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}
test();
