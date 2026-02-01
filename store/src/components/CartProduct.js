import Button from "react-bootstrap/Button";
import { CartContext } from "../CartContext";
import { useContext } from "react";
import useFetchProductData from "../use-fetch-product-data";

function CartProduct(props) {
  const cart = useContext(CartContext);
  const id = props.id;
  const quantity = props.quantity;
  const [productData, loading] = useFetchProductData(id);

  // Format price - remove excessive decimals
  const formatPrice = (price) => {
    const numPrice = parseFloat(price);
    return numPrice.toFixed(2);
  };

  // Get product name - fallback to English if available
  const getProductName = () => {
    if (!productData?.data?.attributes?.name) return "Product";
    const name = productData.data.attributes.name;
    return name.en || name.no || "Product";
  };

  if (loading) {
    return (
      <div className="cart-item" style={{ opacity: 0.6 }}>
        <div className="skeleton skeleton-text"></div>
        <div className="skeleton skeleton-text-sm"></div>
      </div>
    );
  }

  const price = productData?.data?.attributes?.price || 0;
  const totalPrice = quantity * parseFloat(price);

  return (
    <div className="cart-item">
      <h4 className="cart-item-title">{getProductName()}</h4>
      <span className="cart-item-quantity">
        {quantity} × ${formatPrice(price)}
      </span>
      <span className="cart-item-price">${formatPrice(totalPrice)}</span>
      <Button 
        className="btn-remove" 
        size="sm" 
        onClick={() => cart.deleteFromCart(id)}
        style={{ marginTop: 'var(--spacing-xs)', width: 'auto', alignSelf: 'flex-start' }}
      >
        Remove
      </Button>
    </div>
  );
}

export default CartProduct;
