import React from "react";
import "../styles/footer.css";
import { 
  FaInstagram,
  FaTwitter,
  FaTiktok,
  FaFacebook
} from "react-icons/fa";

const Footer = () => {
  const handleSocialClick = (platform) => {
    console.log(`Navigating to ${platform}`);
    // You can add actual social media links here
    const socialLinks = {
      instagram: 'https://instagram.com/nayrakuenshop',
      twitter: 'https://twitter.com/nayrakuenshop', 
      tiktok: 'https://tiktok.com/@nayrakuenshop',
      facebook: 'https://facebook.com/nayrakuenshop'
    };
    
    // Open in new tab
    window.open(socialLinks[platform], '_blank', 'noopener,noreferrer');
  };

  return (
    <footer className="footer">
      <div className="footer-container">
        {/* Logo - Left Side */}
        <div className="footer-logo">
          <span className="logo-bold">Nayrakuen</span> Shop
        </div>
        
        {/* Social Media - Right Side */}
        <div className="social-media">
          <div className="social-links">
            <button 
              className="social-btn instagram"
              onClick={() => handleSocialClick('instagram')}
              title="Instagram"
              aria-label="Visit our Instagram page"
            >
              <FaInstagram />
            </button>
            <button 
              className="social-btn twitter"
              onClick={() => handleSocialClick('twitter')}
              title="Twitter/X"
              aria-label="Visit our Twitter page"
            >
              <FaTwitter />
            </button>
            <button 
              className="social-btn tiktok"
              onClick={() => handleSocialClick('tiktok')}
              title="TikTok"
              aria-label="Visit our TikTok page"
            >
              <FaTiktok />
            </button>
            <button 
              className="social-btn facebook"
              onClick={() => handleSocialClick('facebook')}
              title="Facebook"
              aria-label="Visit our Facebook page"
            >
              <FaFacebook />
            </button>
          </div>
        </div>
        
        {/* Copyright - Bottom Center */}
        <div className="copyright">
          &copy; 2024 Nayrakuen Shop. All rights reserved.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
