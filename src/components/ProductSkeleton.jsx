import "./ProductSkeleton.css";

function ProductSkeleton() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-img"></div>
      <div className="skeleton-body">
        <div className="skeleton-text short"></div>
        <div className="skeleton-text medium"></div>
        <div className="skeleton-text long"></div>
      </div>
    </div>
  );
}

export default ProductSkeleton;
