import React, { useEffect } from 'react';
import { useRally } from '../contexts/RallyContext';
import Scene1LiveStage from '../components/scenes/Scene1LiveStage';
import Scene2TimingTower from '../components/scenes/Scene2TimingTower';
import Scene3Leaderboard from '../components/scenes/Scene3Leaderboard';
import Scene4PilotFocus from '../components/scenes/Scene4PilotFocus';
import Scene5SplitComparison from '../components/scenes/Scene5SplitComparison';

export default function Overlay() {
  const { chromaKey, currentScene, setCurrentScene } = useRally();

  useEffect(() => {
    const handleKeyPress = (e) => {
      const key = parseInt(e.key);
      if (key >= 1 && key <= 5) {
        setCurrentScene(key);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [setCurrentScene]);

  const renderScene = () => {
    switch (currentScene) {
      case 1:
        return <Scene1LiveStage />;
      case 2:
        return <Scene2TimingTower />;
      case 3:
        return <Scene3Leaderboard />;
      case 4:
        return <Scene4PilotFocus />;
      case 5:
        return <Scene5SplitComparison />;
      default:
        return <Scene1LiveStage />;
    }
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: chromaKey }}
      data-testid="overlay-container"
    >
      {renderScene()}
    </div>
  );
}
