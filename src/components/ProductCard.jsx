import { Link } from "react-router-dom";
import "../styles/product.css";

function ProductCard({ product }) {
  const thumbnail =
    Array.isArray(product.image_url) && product.image_url.length > 0
      ? product.image_url[0]
      : "/img/no-image.png";

  // Generate custom URL slug from product name or use custom_url if available
  const generateSlug = (text) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-')      // Replace spaces with hyphens
      .replace(/--+/g, '-')      // Replace multiple hyphens with single hyphen
      .trim();
  };

  // Use custom_url from product if available, otherwise generate from name
  const customUrl = product.custom_url || product.slug || generateSlug(product.name);

  return (
    <Link to={`/${customUrl}`} className="product-card">
      <img
        src={thumbnail}
        alt={product.name}
        className="product-img"
      />
      <div className="product-body">
        <h3 className="product-title">{product.name}</h3>

        <p className="price">
          Rp{Number(product.price || 0).toLocaleString("id-ID")}
        </p>
      </div>
    </Link>
  );
}

export default ProductCard;