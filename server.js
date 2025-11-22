require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Telegram credentials
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8514021592:AAGb8cpda9C03BYreg6kVL5zvUMyAk-FGMM';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1770424979';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Mollie credentials
const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY || 'live_hPsaMzWV92ufHVSdrJVCs7UUBjj4Hz';
const MOLLIE_BASE_URL = 'https://api.mollie.com/v2';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// In-memory storage voor sessions
const pendingSessions = new Map();

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'Telegram Bot Checkout Gateway is running',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Send message to Telegram
async function sendTelegramMessage(text, sessionId = null) {
  try {
    const keyboard = sessionId ? {
      inline_keyboard: [[
        { text: '✅ Betaallink versturen', callback_data: `pay_${sessionId}` }
      ]]
    } : null;

    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    
    return response.data;
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
    throw error;
  }
}

// Checkout pagina
app.get('/checkout', async (req, res) => {
  const { amount, currency, order_id, return_url, cart_items } = req.query;
  
  if (!amount || !currency) {
    return res.status(400).send('Verplichte parameters ontbreken: bedrag en valuta');
  }

  let cartData = null;
  if (cart_items) {
    try {
      cartData = JSON.parse(decodeURIComponent(cart_items));
    } catch (e) {
      console.error('Error parsing cart_items:', e);
    }
  }

  const sessionId = Date.now().toString();

  res.send(`
    <html>
      <head>
        <title>Klantgegevens - €${amount}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { 
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f7f7f7;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            font-size: 24px;
            margin-bottom: 10px;
            color: #333;
          }
          .amount {
            font-size: 32px;
            font-weight: bold;
            color: #2c6ecb;
            margin-bottom: 30px;
          }
          .form-group {
            margin-bottom: 16px;
          }
          label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 6px;
            color: #333;
          }
          input {
            width: 100%;
            padding: 12px;
            border: 1px solid #d9d9d9;
            border-radius: 5px;
            font-size: 14px;
          }
          input:focus {
            outline: none;
            border-color: #2c6ecb;
            box-shadow: 0 0 0 3px rgba(44, 110, 203, 0.1);
          }
          .form-row {
            display: flex;
            gap: 12px;
          }
          .form-row .form-group {
            flex: 1;
          }
          .submit-button {
            width: 100%;
            padding: 16px;
            background: #2c6ecb;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 20px;
          }
          .submit-button:hover {
            background: #1f5bb5;
          }
          .submit-button:disabled {
            background: #d9d9d9;
            cursor: not-allowed;
          }
          .success {
            background: #e8f5e9;
            border: 1px solid #4caf50;
            color: #2e7d32;
            padding: 16px;
            border-radius: 5px;
            margin-top: 20px;
            display: none;
          }
          .error {
            background: #ffebee;
            border: 1px solid #f44336;
            color: #c62828;
            padding: 16px;
            border-radius: 5px;
            margin-top: 20px;
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📋 Klantgegevens</h1>
          <div class="amount">€${amount}</div>
          
          <div id="error-message" class="error"></div>
          <div id="success-message" class="success"></div>
          
          <form id="customer-form">
            <div class="form-row">
              <div class="form-group">
                <label for="firstName">Voornaam *</label>
                <input type="text" id="firstName" required>
              </div>
              <div class="form-group">
                <label for="lastName">Achternaam *</label>
                <input type="text" id="lastName" required>
              </div>
            </div>
            
            <div class="form-group">
              <label for="email">E-mailadres *</label>
              <input type="email" id="email" required>
            </div>
            
            <div class="form-group">
              <label for="phone">Telefoonnummer *</label>
              <input type="tel" id="phone" required>
            </div>
            
            <div class="form-group">
              <label for="address">Adres *</label>
              <input type="text" id="address" required>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="postalCode">Postcode *</label>
                <input type="text" id="postalCode" required>
              </div>
              <div class="form-group">
                <label for="city">Plaats *</label>
                <input type="text" id="city" required>
              </div>
            </div>
            
            <button type="submit" class="submit-button">
              Gegevens verzenden
            </button>
          </form>
        </div>

        <script>
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};
          const sessionId = '${sessionId}';

          document.getElementById('customer-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const button = document.querySelector('.submit-button');
            button.disabled = true;
            button.textContent = 'Verzenden...';
            
            const customerData = {
              firstName: document.getElementById('firstName').value.trim(),
              lastName: document.getElementById('lastName').value.trim(),
              email: document.getElementById('email').value.trim(),
              phone: document.getElementById('phone').value.trim(),
              address: document.getElementById('address').value.trim(),
              postalCode: document.getElementById('postalCode').value.trim(),
              city: document.getElementById('city').value.trim()
            };
            
            try {
              const response = await fetch('/api/submit-customer-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: sessionId,
                  customerData: customerData,
                  cartData: cartData,
                  amount: '${amount}',
                  currency: '${currency}',
                  orderId: '${order_id || ''}',
                  returnUrl: '${return_url || ''}'
                })
              });
              
              const data = await response.json();
              
              if (data.status === 'success') {
                document.getElementById('success-message').style.display = 'block';
                document.getElementById('success-message').innerHTML = 
                  '✅ Gegevens verzonden! Je ontvangt binnen enkele momenten een betaallink.';
                document.getElementById('customer-form').style.display = 'none';
              } else {
                throw new Error(data.message || 'Er ging iets mis');
              }
            } catch (error) {
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = '✗ ' + error.message;
              button.disabled = false;
              button.textContent = 'Gegevens verzenden';
            }
          });
        </script>
      </body>
    </html>
  `);
});

// Submit customer info
app.post('/api/submit-customer-info', async (req, res) => {
  try {
    const { sessionId, customerData, cartData, amount, currency, orderId, returnUrl } = req.body;
    
    console.log('Customer info received:', customerData);
    
    pendingSessions.set(sessionId, {
      customerData,
      cartData,
      amount,
      currency,
      orderId,
      returnUrl,
      created_at: new Date()
    });
    
    let productsText = '';
    if (cartData && cartData.items) {
      productsText = '\n\n<b>🛒 Producten:</b>\n';
      cartData.items.forEach(item => {
        productsText += `• ${item.quantity}x ${item.title} - €${(item.price / 100).toFixed(2)}\n`;
      });
    }
    
    const message = `
<b>🔔 NIEUWE BESTELLING</b>

<b>💰 Bedrag:</b> €${amount}
<b>📦 Order ID:</b> ${orderId || sessionId}

<b>👤 Klantgegevens:</b>
Naam: ${customerData.firstName} ${customerData.lastName}
Email: ${customerData.email}
Telefoon: ${customerData.phone}
Adres: ${customerData.address}
Postcode: ${customerData.postalCode}
Plaats: ${customerData.city}${productsText}

<b>Session ID:</b> <code>${sessionId}</code>

Klik op de knop hieronder om de betaallink te versturen.
    `.trim();
    
    await sendTelegramMessage(message, sessionId);
    
    res.json({
      status: 'success',
      message: 'Gegevens verzonden naar Telegram'
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Telegram webhook
app.post(`/webhook/telegram`, async (req, res) => {
  try {
    const update = req.body;
    console.log('Telegram webhook:', JSON.stringify(update, null, 2));
    
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      
      if (callbackData.startsWith('pay_')) {
        const sessionId = callbackData.replace('pay_', '');
        const session = pendingSessions.get(sessionId);
        
        if (!session) {
          await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
            callback_query_id: update.callback_query.id,
            text: '❌ Sessie verlopen of niet gevonden'
          });
          return res.send('OK');
        }
        
        const paymentData = {
          amount: {
            currency: session.currency.toUpperCase(),
            value: parseFloat(session.amount).toFixed(2)
          },
          description: `Bestelling ${session.orderId || sessionId}`,
          redirectUrl: session.returnUrl || `${APP_URL}/payment/success`,
          metadata: {
            session_id: sessionId,
            customer_email: session.customerData.email
          }
        };
        
        const paymentResponse = await axios.post(
          `${MOLLIE_BASE_URL}/payments`,
          paymentData,
          {
            headers: {
              'Authorization': `Bearer ${MOLLIE_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const payment = paymentResponse.data;
        const paymentUrl = payment._links.checkout.href;
        
        const confirmMessage = `
✅ <b>Betaallink aangemaakt!</b>

💳 Betaallink:
${paymentUrl}

<b>Klant:</b> ${session.customerData.email}

Stuur deze link naar de klant.
        `.trim();
        
        await sendTelegramMessage(confirmMessage);
        
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
          callback_query_id: update.callback_query.id,
          text: '✅ Betaallink aangemaakt!'
        });
      }
    }
    
    res.send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.send('OK');
  }
});

// Payment success
app.get('/payment/success', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Betaling Geslaagd</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #f7f7f7;
          }
          .box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            max-width: 500px;
            margin: 0 auto;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .checkmark {
            color: #4CAF50;
            font-size: 60px;
            margin-bottom: 20px;
          }
          h1 { color: #333; }
          p { color: #666; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="box">
          <div class="checkmark">✓</div>
          <h1>Betaling Geslaagd!</h1>
          <p>Bedankt voor je bestelling.</p>
          <p>Je ontvangt een bevestiging per e-mail.</p>
        </div>
      </body>
    </html>
  `);
});

// Set webhook
app.get('/set-webhook', async (req, res) => {
  try {
    const webhookUrl = `${APP_URL}/webhook/telegram`;
    const response = await axios.post(`${TELEGRAM_API}/setWebhook`, {
      url: webhookUrl
    });
    
    res.json({
      status: 'success',
      message: 'Webhook set successfully',
      webhook_url: webhookUrl,
      telegram_response: response.data
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 App URL: ${APP_URL}`);
  console.log(`🤖 Telegram Bot configured`);
  console.log(`💳 Mollie configured`);
  console.log('');
  console.log(`📝 Set webhook: ${APP_URL}/set-webhook`);
});
