import { useState } from 'react';

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  command?: string;
  hint?: string;
}

const steps: TutorialStep[] = [
  {
    id: 1,
    title: 'Explore the workspace',
    description:
      'This playground has a monorepo with two packages (api-client & ui-kit) and a consumer app that uses them.',
    hint: 'Click on files in the tree to view their source code',
  },
  {
    id: 2,
    title: 'Publish api-client',
    description:
      'Publish the api-client package to the local plunk store. This makes it available for other projects to use.',
    command: 'cd packages/api-client && plunk publish',
  },
  {
    id: 3,
    title: 'Publish ui-kit',
    description: 'Do the same for the ui-kit package.',
    command: 'cd ../ui-kit && plunk publish',
  },
  {
    id: 4,
    title: 'Add packages to consumer',
    description:
      'Link both packages to the consumer app. Plunk copies the built files into node_modules.',
    command: 'cd ../../consumer-app && plunk add @example/api-client @example/ui-kit',
  },
  {
    id: 5,
    title: 'Install dependencies',
    description: 'Install the consumer app dependencies.',
    command: 'npm install',
  },
  {
    id: 6,
    title: 'Start dev server',
    description: 'Start the Vite dev server. The preview will appear on the right.',
    command: 'npm run dev',
  },
  {
    id: 7,
    title: 'Make a change',
    description:
      'Edit packages/api-client/src/index.ts - change the greeting message in getGreeting().',
    hint: 'Find the getGreeting function and change the return string',
  },
  {
    id: 8,
    title: 'Push changes',
    description:
      'Run plunk push to update the consumer app. Watch the preview refresh with your changes!',
    command: 'cd ../packages/api-client && plunk push',
  },
];

interface TutorialProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export function Tutorial({ isCollapsed = false, onToggle }: TutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const handleStepComplete = (stepId: number) => {
    setCompletedSteps((prev) => new Set([...prev, stepId]));
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
  };

  if (isCollapsed) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: 'fixed',
          bottom: '16px',
          right: '16px',
          padding: '12px 16px',
          backgroundColor: '#238636',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span>📚</span>
        Tutorial
        <span
          style={{
            padding: '2px 6px',
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: '10px',
            fontSize: '11px',
          }}
        >
          {completedSteps.size}/{steps.length}
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        width: '360px',
        maxHeight: '70vh',
        backgroundColor: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '12px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        zIndex: 100,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📚</span>
          <span style={{ fontWeight: 600, color: '#c9d1d9' }}>
            Plunk Tutorial
          </span>
        </div>
        <button
          onClick={onToggle}
          style={{
            padding: '4px 8px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: '18px',
          }}
        >
          ×
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ padding: '0 16px', paddingTop: '12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginBottom: '8px',
          }}
        >
          {steps.map((step, idx) => (
            <div
              key={step.id}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '2px',
                backgroundColor:
                  completedSteps.has(step.id)
                    ? '#3fb950'
                    : idx === currentStep
                    ? '#58a6ff'
                    : '#30363d',
                transition: 'background-color 0.2s',
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: '12px', color: '#8b949e' }}>
          Step {currentStep + 1} of {steps.length}
        </div>
      </div>

      {/* Steps list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {steps.map((step, idx) => {
          const isActive = idx === currentStep;
          const isCompleted = completedSteps.has(step.id);
          const isPast = idx < currentStep;

          return (
            <div
              key={step.id}
              onClick={() => setCurrentStep(idx)}
              style={{
                padding: '12px',
                marginBottom: '8px',
                backgroundColor: isActive ? '#21262d' : 'transparent',
                border: isActive
                  ? '1px solid #58a6ff'
                  : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'pointer',
                opacity: isPast && !isActive ? 0.7 : 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    flexShrink: 0,
                    backgroundColor: isCompleted
                      ? '#3fb950'
                      : isActive
                      ? '#58a6ff'
                      : '#30363d',
                    color: isCompleted || isActive ? '#ffffff' : '#8b949e',
                  }}
                >
                  {isCompleted ? '✓' : step.id}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: isActive ? '#c9d1d9' : '#8b949e',
                      marginBottom: '4px',
                    }}
                  >
                    {step.title}
                  </div>
                  {isActive && (
                    <>
                      <p
                        style={{
                          fontSize: '13px',
                          color: '#8b949e',
                          marginBottom: step.command ? '12px' : '0',
                          lineHeight: 1.5,
                        }}
                      >
                        {step.description}
                      </p>

                      {step.command && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: '#0d1117',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            marginBottom: '8px',
                          }}
                        >
                          <code
                            style={{
                              flex: 1,
                              fontSize: '12px',
                              color: '#3fb950',
                              fontFamily:
                                '"SF Mono", Monaco, "Cascadia Code", monospace',
                            }}
                          >
                            {step.command}
                          </code>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyCommand(step.command!);
                            }}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#21262d',
                              border: '1px solid #30363d',
                              borderRadius: '4px',
                              color: '#8b949e',
                              cursor: 'pointer',
                              fontSize: '11px',
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      )}

                      {step.hint && (
                        <p
                          style={{
                            fontSize: '12px',
                            color: '#d29922',
                            fontStyle: 'italic',
                          }}
                        >
                          💡 {step.hint}
                        </p>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStepComplete(step.id);
                        }}
                        style={{
                          marginTop: '12px',
                          padding: '6px 12px',
                          backgroundColor: '#238636',
                          border: 'none',
                          borderRadius: '6px',
                          color: '#ffffff',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 500,
                        }}
                      >
                        {idx === steps.length - 1 ? 'Complete!' : 'Next Step →'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
