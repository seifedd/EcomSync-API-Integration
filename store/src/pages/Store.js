import ProductCard from "../components/ProductCard";
import useFetchData from "../use-fetch-data";

function Store() {
  const [allStoreProducts, loading] = useFetchData();

  if (loading) {
    return (
      <div className="store-container">
        <div className="store-header">
          <h1 className="store-title">Welcome to EcomSync</h1>
          <p className="store-subtitle">
            Discover amazing products at unbeatable prices
          </p>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="store-container">
      <div className="store-header">
        <h1 className="store-title">Welcome to EcomSync</h1>
        <p className="store-subtitle">
          Discover amazing products at unbeatable prices
        </p>
      </div>
      
      {allStoreProducts.length === 0 ? (
        <div className="loading-container">
          <p className="loading-text">No products available</p>
        </div>
      ) : (
        <div className="products-grid">
          {allStoreProducts.map((product, idx) => (
            <ProductCard key={product.id || idx} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Store;
