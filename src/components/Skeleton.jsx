import React from "react";

const Skeleton = ({ width, height, className }) => {
  return (
    <div
      className={`bg-gray-200 animate-pulse rounded ${className}`}
      style={{ width, height }}
    />
  );
};

export default Skeleton;
