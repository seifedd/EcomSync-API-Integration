import { Link } from "react-router-dom";

function Cancel() {
  return (
    <div className="result-page">
      <div className="result-icon">❌</div>
      <h1 className="result-title cancel">Payment Cancelled</h1>
      <p className="result-message">
        Your payment was cancelled. No charges were made to your account. 
        Your cart items are still saved if you'd like to try again.
      </p>
      <Link to="/" className="btn-home">
        ← Return to Store
      </Link>
    </div>
  );
}

export default Cancel;