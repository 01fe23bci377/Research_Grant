import React from 'react';
import { useApp } from '../App';
import DeanDashboard from './DeanDashboard';
import FacultyDashboard from './FacultyDashboard';

export default function Dashboard() {
  const { actor } = useApp();

  // Dean R&D gets dedicated Executive Portfolio Dashboard; other faculties get Personal Workspace Dashboard
  if (actor?.role === 'dean') {
    return <DeanDashboard />;
  }

  return <FacultyDashboard />;
}
