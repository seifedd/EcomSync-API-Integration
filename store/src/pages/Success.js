import { Link } from "react-router-dom";

function Success() {
  return (
    <div className="result-page">
      <div className="result-icon">✅</div>
      <h1 className="result-title success">Payment Successful!</h1>
      <p className="result-message">
        Thank you for your purchase! Your order has been confirmed and will be processed shortly. 
        You'll receive a confirmation email with your order details.
      </p>
      <Link to="/" className="btn-home">
        ← Continue Shopping
      </Link>
    </div>
  );
}

export default Success;