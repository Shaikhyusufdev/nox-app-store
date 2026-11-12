const nodemailer = require('nodemailer');
let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}
async function sendMail(to, subject, html) {
  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') console.log(`[MAIL to ${to}] ${subject}\n${html}`);
    return;
  }
  await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
}
module.exports = { sendMail };
