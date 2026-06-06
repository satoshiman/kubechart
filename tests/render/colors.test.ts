import { getPodStatusColor, getColor, setUseColors } from '../../src/render/colors.js';

describe('colors', () => {
  beforeEach(() => {
    // Reset to default (colors enabled) before each test
    setUseColors(true);
  });

  describe('getPodStatusColor', () => {
    it('should return green for Running phase', () => {
      expect(getPodStatusColor('Running')).toBe('#22c55e');
    });

    it('should return yellow for Pending phase', () => {
      expect(getPodStatusColor('Pending')).toBe('#eab308');
    });

    it('should return red for Failed phase', () => {
      expect(getPodStatusColor('Failed')).toBe('#ef4444');
    });

    it('should return gray for Succeeded phase', () => {
      expect(getPodStatusColor('Succeeded')).toBe('#6b7280');
    });

    it('should return gray for Unknown phase', () => {
      expect(getPodStatusColor('Unknown')).toBe('#6b7280');
    });

    it('should return empty string when colors are disabled', () => {
      setUseColors(false);
      expect(getPodStatusColor('Running')).toBe('');
    });
  });

  describe('getColor', () => {
    it('should return correct color for valid color names', () => {
      expect(getColor('running')).toBe('#22c55e');
      expect(getColor('pending')).toBe('#eab308');
      expect(getColor('failed')).toBe('#ef4444');
      expect(getColor('deployment')).toBe('#3b82f6');
      expect(getColor('statefulSet')).toBe('#8b5cf6');
      expect(getColor('header')).toBe('#06b6d4');
    });

    it('should return empty string when colors are disabled', () => {
      setUseColors(false);
      expect(getColor('running')).toBe('');
      expect(getColor('header')).toBe('');
    });
  });

  describe('setUseColors', () => {
    it('should disable colors when set to false', () => {
      setUseColors(false);
      expect(getColor('running')).toBe('');
    });

    it('should enable colors when set to true', () => {
      setUseColors(false);
      expect(getColor('running')).toBe('');
      setUseColors(true);
      expect(getColor('running')).toBe('#22c55e');
    });
  });
});
