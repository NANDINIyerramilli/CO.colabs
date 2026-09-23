import React from 'react';
import HomeComponent from '../Components/Home/HomeComponent';

const Home = () => {
  const createId = () => Math.random().toString(36).substring(2, 10);

  return <HomeComponent createId={createId} />;
};

export default Home;