export const generateDescription = async (req, res) => {
  try {
    const { name, category, condition, tags } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Product name is required.' });
    }

    const prompt = `Write a short, compelling product description for a second-hand item listed on a South African online store called Halfsec.

Product name: ${name}
Category: ${category || 'General'}
Condition: ${condition || 'Good'}
Tags: ${tags?.join(', ') || 'none'}

Rules:
- 2-3 sentences maximum
- Honest and accurate about it being second-hand
- Highlight the value and quality
- Mention the condition naturally
- Conversational, not corporate
- No emojis
- No price mentions
- End with something that makes the buyer want it

Return only the description text, nothing else.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const description = data.content?.[0]?.text?.trim();

    if (!description) {
      return res.status(500).json({ message: 'Failed to generate description.' });
    }

    res.status(200).json({ description });
  } catch (error) {
    console.error('AI description error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};