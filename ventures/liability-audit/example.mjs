// A made-up app with a typical set of problems, for the page's example
// button and the tests. Nothing here is a real key, product or person: the
// "secret" is assembled at load time from obviously fake parts so that no
// scanner, this one included, reads the source file as a leak.

const fakeKey = ['sk', 'live', '9fQx2LmZ7RtW4vK8pN3sJ6hD'].join('_');

export const EXAMPLE_APP = Object.freeze([
  { path: 'package.json', text: '{ "name": "acme-cover-letters", "version": "1.0.0" }' },
  {
    path: 'public/index.html',
    text: `<!doctype html>
<html><head>
<title>Cover Letter Writer</title>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE1"></script>
<script>window.dataLayer=[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-EXAMPLE1');</script>
</head><body>
<h1>Write a cover letter in 30 seconds</h1>
<form id="f"><input type="email" name="email" placeholder="you@example.com"><textarea name="job"></textarea><button>Write it</button></form>
<p>Pro: $12/month. <button id="buy">Go Pro</button></p>
<p>Our favourite resume paper: <a href="https://amzn.to/3exampl">buy here</a>.</p>
</body></html>`,
  },
  {
    path: 'api/write.js',
    text: `import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req) {
  const { job } = await req.json();
  const msg = await client.messages.create({
    model: 'claude-example',
    messages: [{ role: 'user', content: 'Write a cover letter for: ' + job }],
  });
  return Response.json({ text: msg.content[0].text });
}`,
  },
  {
    path: 'api/checkout.js',
    text: `import Stripe from 'stripe';
const stripe = new Stripe('${fakeKey}');

export async function POST() {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: 'price_pro_monthly', quantity: 1 }],
    success_url: 'https://acme.example/thanks',
  });
  return Response.json({ url: session.url });
}`,
  },
  {
    path: 'infra/main.tf',
    text: `provider "aws" {
  region = "us-east-1"
}

resource "aws_lambda_function" "api" {
  function_name = "cover-letters"
}`,
  },
]);
