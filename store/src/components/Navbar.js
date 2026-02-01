import { Button, Container, Navbar, Modal } from "react-bootstrap";
import { useState, useContext } from "react";
import { CartContext } from "../CartContext";
import CartProduct from "./CartProduct";

function NavbarComponent() {
  const cart = useContext(CartContext);

  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  const checkout = async () => {
    await fetch("http://localhost:4000/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: cart.items }),
    })
      .then((response) => {
        return response.json();
      })
      .then((response) => {
        if (response.url) {
          window.location.assign(response.url); // Forwarding user to Stripe
        }
      });
  };

  const productsCount = cart.items.reduce(
    (sum, product) => sum + product.quantity,
    0
  );

  const getTotalCost = () => {
    // This would need product data - for now showing item count
    return productsCount;
  };

  return (
    <>
      <Navbar expand="lg" className="navbar-dark" variant="dark">
        <Container>
          <Navbar.Brand href="/">
            <img 
              src="/ecomsync-logo.png" 
              alt="EcomSync" 
              style={{ height: '40px', width: '40px', borderRadius: '8px' }}
            />
            <span className="brand-text">EcomSync</span>
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="navbar-nav" />
          <Navbar.Collapse id="navbar-nav" className="justify-content-end">
            <Button className="btn-cart" onClick={handleShow}>
              🛒 Cart ({productsCount})
            </Button>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      
      <Modal show={show} onHide={handleClose} centered>
        <Modal.Header closeButton>
          <Modal.Title>🛒 Shopping Cart</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {productsCount > 0 ? (
            <>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--spacing-md)' }}>
                {productsCount} item{productsCount !== 1 ? 's' : ''} in your cart
              </p>
              {cart.items.map((currentProduct, idx) => (
                <CartProduct
                  key={idx}
                  id={currentProduct.id}
                  quantity={currentProduct.quantity}
                />
              ))}
              <Button className="btn-checkout" onClick={checkout}>
                ✨ Proceed to Checkout
              </Button>
            </>
          ) : (
            <div className="cart-empty">
              <div className="cart-empty-icon">🛒</div>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: 'var(--spacing-sm)' }}>
                Your cart is empty
              </h4>
              <p style={{ color: 'var(--text-secondary)' }}>
                Add some products to get started!
              </p>
            </div>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}

export default NavbarComponent;
