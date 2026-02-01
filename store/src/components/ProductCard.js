import { Button } from "react-bootstrap";
import { CartContext } from "../CartContext";
import { useContext } from "react";

function ProductCard(props) {
  const product = props.product;
  const cart = useContext(CartContext);
  const productQuantity = cart.getProductQuantity(product.id);

  // Format price - remove excessive decimals
  const formatPrice = (price) => {
    const numPrice = parseFloat(price);
    return numPrice.toFixed(2);
  };

  // Get product name - fallback to English if available, otherwise use Norwegian
  const getProductName = () => {
    const name = product.attributes?.name;
    if (!name) return "Product";
    return name.en || name.no || "Product";
  };

  return (
    <div className="product-card">
      <div className="product-image-container">
        <div className="product-image-placeholder"></div>
      </div>
      <div className="product-card-body">
        <h3 className="product-title">{getProductName()}</h3>
        <p className="product-price">${formatPrice(product.attributes?.price || 0)}</p>
        
        {productQuantity > 0 ? (
          <>
            <div className="quantity-controls">
              <Button
                className="btn-quantity"
                onClick={() => cart.removeOneFromCart(product.id)}
              >
                −
              </Button>
              <span className="product-quantity">
                <strong>{productQuantity}</strong> in cart
              </span>
              <Button
                className="btn-quantity"
                onClick={() => cart.addOneToCart(product.id)}
              >
                +
              </Button>
            </div>
            <Button
              className="btn-remove"
              onClick={() => cart.deleteFromCart(product.id)}
            >
              🗑️ Remove from cart
            </Button>
          </>
        ) : (
          <Button
            className="btn-add-cart"
            onClick={() => cart.addOneToCart(product.id)}
          >
            🛒 Add to Cart
          </Button>
        )}
      </div>
    </div>
  );
}

export default ProductCard;
