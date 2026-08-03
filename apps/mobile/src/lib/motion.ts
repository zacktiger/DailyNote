import { cssInterop } from 'nativewind';
import { Pressable } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';

// NativeWind only styles components registered with it; Animated.* are not,
// so className on them silently does nothing until this runs. Registered here
// because every screen that animates imports this module.
cssInterop(Animated.View, { className: 'style' });
cssInterop(Animated.Text, { className: 'style' });

/** Pressable that accepts both an animated style and Tailwind classes. */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
cssInterop(AnimatedPressable, { className: 'style' });

/**
 * The motion system: one spring, one duration, used everywhere.
 *
 * The product is paper, so motion is quiet, quick and physical -- springs
 * that settle fast, fades under ~200ms, nothing that draws attention to
 * itself. Every preset carries ReduceMotion.System, so a user with reduced
 * motion enabled gets instant transitions rather than slower ones.
 */

/** For withSpring(): settles fast, no visible wobble. */
export const SPRING = {
  damping: 26,
  stiffness: 300,
  reduceMotion: ReduceMotion.System,
} as const;

export const ENTER_MS = 200;
export const EXIT_MS = 120;

/** Soft fade-up for things appearing in place (chips, rows, sections). */
export const enter = FadeInDown.duration(ENTER_MS).reduceMotion(ReduceMotion.System);

/** Plain fade for surfaces where a slide would be noise (screens, empty states). */
export const enterFade = FadeIn.duration(ENTER_MS).reduceMotion(ReduceMotion.System);

/** Quick fade-out; exits should be faster than entrances. */
export const exit = FadeOut.duration(EXIT_MS).reduceMotion(ReduceMotion.System);

/** Springy reflow for siblings when something appears, disappears or moves. */
export const layout = LinearTransition.springify()
  .damping(26)
  .stiffness(300)
  .reduceMotion(ReduceMotion.System);

/** `enter`, delayed for list positions: stagger(0), stagger(1), ... */
export function stagger(index: number) {
  return FadeInDown.duration(ENTER_MS)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System);
}
