// Kubechart Landing Page JavaScript
/* eslint-env browser */

document.addEventListener('DOMContentLoaded', () => {
  initTypingAnimation();
  initScrollAnimations();
  initSmoothScroll();
});

// Copy to clipboard functionality - used by HTML onclick handler
// eslint-disable-next-line no-unused-vars
function copyInstall() {
  const command = 'npx kubechart';
  navigator.clipboard.writeText(command).then(() => {
    const buttons = document.querySelectorAll('.copy-btn');
    buttons.forEach((btn) => {
      btn.classList.add('copied');
      const originalHTML = btn.innerHTML;
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = originalHTML;
      }, 2000);
    });
  });
}

// Typing animation for hero terminal
function initTypingAnimation() {
  const typingText = document.getElementById('typing-text');
  const terminalOutput = document.getElementById('terminal-output');

  if (!typingText || !terminalOutput) return;

  const command = 'npx kubechart -n production';
  const outputLines = [
    { text: '', delay: 0 },
    {
      text: '◆ CLUSTER production-eks | k8s v1.30.0 | 3 nodes',
      delay: 300,
      color: 'var(--color-accent-light)',
    },
    { text: '', delay: 100 },
    {
      text: '[m]etric: use/lim [s]elector: OFF | ↺ 3/5s',
      delay: 200,
      color: 'var(--color-text-muted)',
    },
    { text: '', delay: 100 },
    { text: '└── NAMESPACE production [Active]', delay: 200, color: 'var(--color-text-muted)' },
    { text: '    ├── ▲ Deployment api-server [3/3]', delay: 150, color: '#58a6ff' },
    {
      text: '    │   └── ◆ ReplicaSet api-76f555f8cd [3/3]',
      delay: 100,
      color: 'var(--color-text-secondary)',
    },
    { text: '    │       ├── POD ● api-d9jb6  CPU ████░░░░ 45%', delay: 100, color: '#3fb950' },
    { text: '    │       ├── POD ● api-gmv7w  CPU █████░░░ 52%', delay: 80, color: '#3fb950' },
    { text: '    │       └── POD ● api-x2k9p  CPU ███░░░░░ 38%', delay: 80, color: '#3fb950' },
    { text: '    │', delay: 50 },
    { text: '    ├── ◆ StatefulSet redis [2/2]', delay: 150, color: '#a371f7' },
    { text: '    │   ├── POD ● redis-0  MEM ████████ 80%', delay: 100, color: '#3fb950' },
    { text: '    │   └── POD ● redis-1  MEM ███████░ 75%', delay: 80, color: '#3fb950' },
    { text: '    │', delay: 50 },
    { text: '    ├── ■ DaemonSet fluentd [3/3]', delay: 150, color: '#3fb950' },
    { text: '    │', delay: 50 },
    {
      text: '    ├── ○ CronJob backup [last: 2h ago]',
      delay: 150,
      color: 'var(--color-text-muted)',
    },
    { text: '    │', delay: 50 },
    { text: '    ├── SVC ● ClusterIP api-service  10.101.87.67', delay: 150, color: '#f0883e' },
    { text: '    ├── ING ◆ api.example.com  / → api-service:80', delay: 100, color: '#79c0ff' },
    { text: '    └── CM ◉ app-config  12 keys', delay: 100, color: '#56d364' },
    { text: '', delay: 100 },
    {
      text: 'Workloads: 4 | Pods: 6/7 running | Services: 1',
      delay: 200,
      color: 'var(--color-text-muted)',
    },
  ];

  let charIndex = 0;
  let lineIndex = 0;

  // Type the command first
  function typeCommand() {
    if (charIndex < command.length) {
      typingText.textContent += command.charAt(charIndex);
      charIndex++;
      setTimeout(typeCommand, 50 + Math.random() * 50);
    } else {
      setTimeout(showOutput, 400);
    }
  }

  // Show the output lines
  function showOutput() {
    if (lineIndex >= outputLines.length) {
      // Animation complete - add blinking cursor effect to the last line
      return;
    }

    const line = outputLines[lineIndex];
    const div = document.createElement('div');
    div.textContent = line.text;
    div.style.color = line.color || 'var(--color-text-secondary)';
    div.style.fontFamily = 'var(--font-mono)';
    div.style.fontSize = '0.8125rem';
    div.style.lineHeight = '1.6';
    div.style.whiteSpace = 'pre';
    div.style.opacity = '0';
    div.style.transform = 'translateY(4px)';
    div.style.transition = 'opacity 0.2s, transform 0.2s';

    terminalOutput.appendChild(div);

    // Trigger animation
    requestAnimationFrame(() => {
      div.style.opacity = '1';
      div.style.transform = 'translateY(0)';
    });

    lineIndex++;
    setTimeout(showOutput, line.delay);
  }

  // Start typing after a short delay
  setTimeout(typeCommand, 800);
}

// Scroll animations using Intersection Observer
function initScrollAnimations() {
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe cards and sections
  const animatedElements = document.querySelectorAll(
    '.problem-card, .feature-card, .quickstart-card, .usecase-card, .legend-item, .shortcut'
  );

  animatedElements.forEach((el, index) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = `opacity 0.4s ease ${index * 0.05}s, transform 0.4s ease ${index * 0.05}s`;
    observer.observe(el);
  });

  // Add CSS for animate-in class
  const style = document.createElement('style');
  style.textContent = `
    .animate-in {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
  `;
  document.head.appendChild(style);
}

// Smooth scroll for anchor links
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        const headerOffset = 80;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
      }
    });
  });
}

// Add hover effect to demo terminals
function initDemoHover() {
  const kubechartOutput = document.querySelector('.kubechart-output pre');
  if (kubechartOutput) {
    const lines = kubechartOutput.querySelectorAll('div, span');
    lines.forEach((line) => {
      line.addEventListener('mouseenter', () => {
        line.style.background = 'rgba(50, 108, 229, 0.1)';
      });
      line.addEventListener('mouseleave', () => {
        line.style.background = 'transparent';
      });
    });
  }
}

// Stats counter animation - available for future use
// eslint-disable-next-line no-unused-vars
function animateStats() {
  const stats = document.querySelectorAll('.stat-number');

  stats.forEach((stat) => {
    const target = parseInt(stat.getAttribute('data-target'));
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;

    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        stat.textContent = target.toLocaleString();
        clearInterval(timer);
      } else {
        stat.textContent = Math.floor(current).toLocaleString();
      }
    }, 16);
  });
}

// Reveal comparison table rows
function revealComparisonTable() {
  const table = document.querySelector('.comparison-table');
  if (!table) return;

  const rows = table.querySelectorAll('tbody tr');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          rows.forEach((row, index) => {
            setTimeout(() => {
              row.style.opacity = '1';
              row.style.transform = 'translateX(0)';
            }, index * 80);
          });
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  rows.forEach((row) => {
    row.style.opacity = '0';
    row.style.transform = 'translateX(-20px)';
    row.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  });

  observer.observe(table);
}

// Initialize additional features when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initDemoHover();
  revealComparisonTable();
});
