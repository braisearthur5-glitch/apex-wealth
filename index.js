const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/generate-plan', async (req, res) => {
  try {
    const { age, income, savings, risk } = req.body;
    
    let allocation = { stocks: 60, bonds: 30, cash: 10, rationale: 'Standard allocation based on your profile.' };
    let source = 'fallback';
    
    if (process.env.GROQ_API_KEY) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'Return ONLY raw JSON: {"stocks": 60, "bonds": 30, "cash": 10, "rationale": "2 sentences"}' },
              { role: 'user', content: 'Age: ' + age + ', Income: ' + income + ', Savings: ' + savings + ', Risk: ' + risk }
            ]
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          const aiAlloc = JSON.parse(data.choices[0].message.content);
          if (aiAlloc && aiAlloc.stocks !== undefined) {
            allocation = aiAlloc;
            source = 'ai';
          }
        }
      } catch (err) {
        console.log('AI Error:', err.message);
      }
    }

    // SAFELY PARSE NUMBERS
    const inc = Number(income) || 0;
    const sav = Number(savings) || 0;
    const a = Number(age) || 30;

    const annualContribution = inc * 0.15;
    const s = Number(allocation.stocks) || 60;
    const b = Number(allocation.bonds) || 30;
    const c = Number(allocation.cash) || 10;
    const expectedReturn = (s * 0.09 + b * 0.045 + c * 0.02) / 100;
    const yearsToRetire = Math.max(0, 65 - a);
    
    function getProjection(returnRate) {
      let balance = sav;
      let points = [];
      for (let i = 0; i <= yearsToRetire; i++) {
        points.push({ age: a + i, balance: Math.round(balance) });
        balance = (balance + annualContribution) * (1 + returnRate);
      }
      return points;
    }

    res.json({
      source: source,
      allocation: { stocks: s, bonds: b, cash: c, rationale: allocation.rationale || '' },
      scenarios: {
        bear: getProjection(Math.max(0.005, expectedReturn - 0.04)),
        base: getProjection(expectedReturn),
        bull: getProjection(expectedReturn + 0.04)
      },
      assumptions: {
        savingsRate: 0.15,
        annualContribution: Math.round(annualContribution),
        expectedReturnBase: expectedReturn,
        expectedReturnBear: expectedReturn - 0.04,
        expectedReturnBull: expectedReturn + 0.04,
        retirementAge: 65,
        compounding: 'annual'
      },
      disclaimer: 'For educational purposes only. Not financial advice.'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error processing plan.' });
  }
});

app.listen(process.env.PORT || 8001, '0.0.0.0', () => {
  console.log('Server running!');
});
