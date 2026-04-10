export default function Privacy() {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px', fontFamily: 'sans-serif', lineHeight: 1.7, color: '#333' }}>
      <h1>Privacy Policy</h1>
      <p><strong>Last updated:</strong> April 2026</p>
      <p>Grihaz ("we", "our", or "us") is a household management app developed by Rhyea. This Privacy Policy explains how we collect, use, and protect your information.</p>
      <h2>Information We Collect</h2>
      <p>We collect information you provide directly, including your email address, household data, staff attendance records, and expense data. If you connect Gmail, we access your Gmail inbox in read-only mode to extract order confirmation emails from Blinkit, Zomato, and Amazon.</p>
      <h2>How We Use Your Information</h2>
      <p>We use your information solely to provide the Grihaz service — including tracking attendance, calculating payroll, and importing household expenses. We do not sell your data to third parties.</p>
      <h2>Gmail Data</h2>
      <p>Grihaz's use of Gmail data is limited to reading order confirmation emails for expense tracking purposes. We do not store raw email content. Extracted order data is stored securely in your household account.</p>
      <h2>Data Security</h2>
      <p>Your data is stored securely using Supabase with row-level security. Only members of your household can access your household data.</p>
      <h2>Contact</h2>
      <p>For questions, contact us at <a href="mailto:hello@rhyea.com">hello@rhyea.com</a>.</p>
      <p><a href="/">← Back to Grihaz</a></p>
    </div>
  )
}