// sk_test_51M0xn8JAtf0lxKlAYMntJsxioIsR9zlSNRLWi8WxGo9X3Mth2835az956QXXGfCzorvVPRJXPEOkPy4tp5r3EBVf002OALCVJR
// Coffee: price_1LnUTFDM1jwCEz8OGoOSXiSM
// Sunglasses: price_1LnUTxDM1jwCEz8OAqHYTwKQ
// Camera: price_1LnUUoDM1jwCEz8OvxIcJ7to
const express = require("express");
var cors = require("cors");
const stripe = require("stripe")(
  "sk_test_51M0xn8JAtf0lxKlAYMntJsxioIsR9zlSNRLWi8WxGo9X3Mth2835az956QXXGfCzorvVPRJXPEOkPy4tp5r3EBVf002OALCVJR"
);

const app = express();
app.use(cors());
app.use(express.static("public"));
app.use(express.json());

app.post("checkout", async (req, res) => {
  /*
    req.body.items
    [
        {
            id: 1,
            quantity: 3
        }
    ]

    stripe wants
    [
        {
            price: 1,
            quantity: 3
        }
    ]
    */
  console.log(req.body);
  const items = req.body.items;
  let lineItems = [];
  items.forEach((item) => {
    lineItems.push({
      price: item.id,
      quantity: item.quantity,
    });
  });

  const session = await stripe.checkout.sessions.create({
    line_items: lineItems,
    mode: "payment",
    success_url: "http://localhost:3000/success",
    cancel_url: "http://localhost:3000/cancel",
  });

  res.send(
    JSON.stringify({
      url: session.url,
    })
  );
});

app.listen(4000, () => console.log("Listening on port 4000!"));
