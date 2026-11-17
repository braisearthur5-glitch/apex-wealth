const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Hardcoded average 401k/retirement savings by age (Fidelity data)
function getAverageSavings(age) {
  if (age < 25) return 6000;
  if (age < 30) return 15000;
  if (age < 35) return 35000;
  if (age < 40) return 60000;
  if (age < 45) return 90000;
  if (age < 50) return 130000;
  if (age < 55) return 180000;
  if (age < 60) return 230000;
  return 280000;
}

app.post('/api/generate-plan', async (req, res) => {
  try {
    const { age, income, savings, risk } = req.body;
    
    let allocation = { 
      stocks: 60, bonds: 30, cash: 10, 
      rationale: 'Standard allocation based on your profile.',
      actionPlan: [
        "Automate your savings: Set up a monthly transfer to your investment account.",
        "Max out tax-advantaged accounts like a 401(k) or IRA first.",
        "Invest in low-cost index funds (like VTI or VOO) to capture market growth."
      ]
    };
    let source = 'fallback';
    
    if (process.env.GROQ_API_KEY) {
      try {
        const prompt = `You are an elite, fiduciary financial advisor. Client profile: Age ${age}, Income $${income}/yr, Savings $${savings}, Risk ${risk}.
        Return ONLY raw JSON with this exact structure:
        {
          "stocks": 60,
          "bonds": 30,
          "cash": 10,
          "rationale": "A 2-sentence explanation of why this fits their profile.",
          "actionPlan": [
            "Specific tax-advantaged account advice based on their income.",
            "Specific asset class or ETF recommendation (e.g., VTI, VXUS).",
            "One behavioral or savings rate strategy for their age."
          ]
        }`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }]
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

    // Peer Benchmarking
    const avgSavings = getAverageSavings(a);
    let percentile = Math.round((sav / avgSavings) * 50);
    if (percentile > 99) percentile = 99;
    if (percentile < 5) percentile = 5;

    res.json({
      source: source,
      allocation: { 
        stocks: s, bonds: b, cash: c, 
        rationale: allocation.rationale || '',
        actionPlan: allocation.actionPlan || []
      },
      scenarios: {
        bear: getProjection(Math.max(0.005, expectedReturn - 0.04)),
        base: getProjection(expectedReturn),
        bull: getProjection(expectedReturn + 0.04)
      },
      peerData: {
        averageSavings: avgSavings,
        percentile: percentile
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
      disclaimer: 'For educational purposes only. Not financial advice. Always consult a licensed professional.'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error processing plan.' });
  }
});

app.listen(process.env.PORT || 8001, '0.0.0.0', () => {
  console.log('Server running!');
});
