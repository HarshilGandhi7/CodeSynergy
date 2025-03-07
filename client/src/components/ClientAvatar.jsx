import React, { useEffect, useState } from "react";

export const ClientAvatar = ({ userName }) => {
  const [bgColor, setBgColor] = useState("");

  const getInitials = (name) => {
    return name
      .split(" ")
      .map((n) => n[0].toUpperCase())
      .join("");
  };

  const getRandomColor = () => {
    const colors = [
      "bg-red-500",
      "bg-green-500",
      "bg-blue-500",
      "bg-yellow-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-teal-500",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  useEffect(() => {
    setBgColor(getRandomColor());
  }, []);

  return (
    <div className="flex items-center space-x-3 bg-gray-800 p-3 rounded-lg shadow-md hover:bg-gray-700 transition duration-300">
      <div className={`w-12 h-12 flex items-center justify-center ${bgColor} text-white rounded-full font-bold text-lg`}>
        {getInitials(userName)}
      </div>

      <span className="text-white font-medium">{userName}</span>
    </div>
  );
};
