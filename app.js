require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

const app = express();
app.use(bodyParser.json());

mongoose.connect(process.env.DB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Could not connect to MongoDB', err));

console.log('Attempted to connect to MongoDB with URI:', process.env.DB_URI);

const UserSchema = new mongoose.Schema({
  number: { 
    type: String, 
    required: true, 
    unique: true,
    default: '',
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: props => `${props.value} is not a valid phone number!`
    }
  },
  lastInteraction: { 
    type: Date, 
    default: Date.now 
  },
  interactionHistory: [{
    date: { type: Date, default: Date.now },
    transcript: String,
    summary: String
  }]
});

UserSchema.index({ number: 1 }, { unique: true });

const User = mongoose.model('User', UserSchema);

app.post('/webhook', async (req, res) => {
  console.log('Received webhook:', JSON.stringify(req.body, null, 2));
  
  const { message } = req.body;
  if (!message || !message.customer || !message.customer.number) {
    console.error('Error: Missing customer information or number');
    return res.status(400).json({ error: 'Missing customer information or number' });
  }

  const number = message.customer.number.trim();
  if (!number) {
    console.error('Error: Customer number is null or invalid');
    return res.status(400).json({ error: 'Customer number is null or invalid' });
  }

  console.log('Number:', number);

  try {
    let user = await User.findOne({ number });
    
    if (!user) {
      console.log('Creating new user with number:', number);
      user = new User({ 
        number,
        lastInteraction: new Date(),
        interactionHistory: []
      });
    }

    // Update existing user or newly created user
    user.lastInteraction = new Date();

    if (message.type === 'end-of-call-report') {
      const { transcript, summary } = message;
      if (transcript && summary) {
        user.interactionHistory.push({ 
          date: new Date(),
          transcript, 
          summary 
        });
      } else {
        console.log('Warning: Missing transcript or summary');
      }
    } else if (message.type === 'status-update') {
      console.log('Received status update:', message.status);
      user.lastStatus = message.status;
    }

    await user.save();
    console.log('Updated user data:', JSON.stringify(user, null, 2));
  } catch (error) {
    if (error.code === 11000) {
      console.error('Duplicate key error:', error);
      return res.status(409).json({ error: 'Duplicate key error: phone number already exists' });
    } else {
      console.error('Error processing webhook:', error);
      return res.status(500).json({ error: 'Error processing webhook' });
    }
  }
  
  res.sendStatus(200);
});

// Add a test route
app.get('/test', (req, res) => {
  res.send('Server is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
