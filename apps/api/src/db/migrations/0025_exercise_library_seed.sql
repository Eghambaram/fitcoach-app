-- Reference data (D21, PROMPT §8.5): the global exercise library and seven starter program
-- templates. Generated from structured data and validated (every substitution and template
-- exercise exists in the library). Original, generic text; no outcome claims; no media.
-- workspace_id NULL = global and read-only for fitcoach_app (see 0024).

INSERT INTO exercises (workspace_id, name, category, muscle_groups, equipment, difficulty, instructions, safety_notes) VALUES
  (NULL, 'Barbell Back Squat', 'strength', ARRAY['quads', 'glutes', 'hamstrings']::text[], ARRAY['barbell']::text[], 'intermediate', 'Rest the bar across your upper back, feet about shoulder-width apart. Brace your core, sit your hips down and back until your thighs are about parallel, then drive up through your whole foot.', 'Keep your knees tracking over your toes and your back neutral. Use safety bars or a spotter for heavy sets.'),
  (NULL, 'Front Squat', 'strength', ARRAY['quads', 'glutes', 'core']::text[], ARRAY['barbell']::text[], 'advanced', 'Hold the bar on the front of your shoulders with elbows high. Squat down keeping your torso upright, then stand back up.', 'Drop the bar forward if you lose position. Build wrist and upper-back mobility before going heavy.'),
  (NULL, 'Goblet Squat', 'strength', ARRAY['quads', 'glutes', 'core']::text[], ARRAY['dumbbell']::text[], 'beginner', 'Hold a dumbbell or kettlebell at your chest. Sit down between your heels with your chest tall, pause briefly, then stand up.', 'Keep your heels down. Only go as deep as you can while keeping a neutral back.'),
  (NULL, 'Bodyweight Squat', 'strength', ARRAY['quads', 'glutes']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Stand with feet shoulder-width apart, arms forward for balance. Sit your hips back and down, then stand tall.', 'Move through a pain-free range. Hold onto a support if balance is a problem.'),
  (NULL, 'Box Squat', 'strength', ARRAY['quads', 'glutes']::text[], ARRAY['box', 'bodyweight']::text[], 'beginner', 'Stand in front of a box or bench. Sit back until you lightly touch it, keep tension, then stand up.', 'Don''t drop onto the box. Choose a height that keeps your back neutral.'),
  (NULL, 'Leg Press', 'strength', ARRAY['quads', 'glutes']::text[], ARRAY['machine']::text[], 'beginner', 'Sit with your back flat on the pad and feet hip-width on the platform. Lower the platform under control, then press it away without locking your knees.', 'Keep your lower back against the pad. Don''t let your knees cave inward.'),
  (NULL, 'Romanian Deadlift', 'strength', ARRAY['hamstrings', 'glutes', 'back']::text[], ARRAY['barbell']::text[], 'intermediate', 'Hold the bar at hip height. With soft knees, push your hips back and lower the bar along your legs until you feel a stretch in your hamstrings, then drive your hips forward to stand.', 'Keep the bar close and your back flat. Stop before your back starts to round.'),
  (NULL, 'Dumbbell Romanian Deadlift', 'strength', ARRAY['hamstrings', 'glutes']::text[], ARRAY['dumbbell']::text[], 'beginner', 'Hold dumbbells in front of your thighs. Hinge at the hips with a long spine, lower the weights along your legs, then stand back up squeezing your glutes.', 'Keep your neck in line with your spine and the weights close to your body.'),
  (NULL, 'Conventional Deadlift', 'strength', ARRAY['hamstrings', 'glutes', 'back']::text[], ARRAY['barbell']::text[], 'advanced', 'Stand with the bar over mid-foot. Grip just outside your knees, brace, and push the floor away to stand up with the bar close to your legs. Lower it the same way.', 'Set your back flat before every rep. Don''t jerk the bar off the floor.'),
  (NULL, 'Trap Bar Deadlift', 'strength', ARRAY['quads', 'glutes', 'hamstrings']::text[], ARRAY['barbell']::text[], 'intermediate', 'Stand inside the hex bar, grip the handles, brace and stand up by pushing through your feet. Lower under control.', 'Keep your chest up and your back neutral throughout.'),
  (NULL, 'Walking Lunge', 'strength', ARRAY['quads', 'glutes']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Step forward and lower until both knees are bent about 90 degrees, then push off the back foot and step into the next lunge.', 'Keep your front knee over your foot. Shorten the step if balance is difficult.'),
  (NULL, 'Reverse Lunge', 'strength', ARRAY['quads', 'glutes']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Step one foot back and lower your back knee towards the floor. Push through the front heel to return. Alternate legs.', 'Keep your torso upright and move slowly at first.'),
  (NULL, 'Dumbbell Reverse Lunge', 'strength', ARRAY['quads', 'glutes']::text[], ARRAY['dumbbell']::text[], 'intermediate', 'Hold dumbbells at your sides and step back into a lunge, then return to standing. Alternate legs.', 'Use a weight you can control with a steady torso.'),
  (NULL, 'Split Squat', 'strength', ARRAY['quads', 'glutes']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Stand in a long split stance. Lower your back knee straight down towards the floor, then press back up. Finish one side, then switch.', 'Keep most of your weight on the front foot. Use a wall for balance if needed.'),
  (NULL, 'Bulgarian Split Squat', 'strength', ARRAY['quads', 'glutes']::text[], ARRAY['bench', 'dumbbell']::text[], 'intermediate', 'Rest your back foot on a bench behind you. Lower your back knee towards the floor, then drive up through the front foot.', 'Set the front foot far enough forward that your heel stays down.'),
  (NULL, 'Step-Up', 'strength', ARRAY['quads', 'glutes']::text[], ARRAY['box']::text[], 'beginner', 'Place one foot on a sturdy box or step. Push through that foot to stand on top, then step down with control.', 'Use a stable surface and a height that keeps your knee comfortable.'),
  (NULL, 'Glute Bridge', 'strength', ARRAY['glutes', 'hamstrings']::text[], ARRAY['bodyweight', 'mat']::text[], 'beginner', 'Lie on your back, knees bent, feet flat. Press through your heels to lift your hips until your body forms a straight line, pause, then lower.', 'Squeeze your glutes rather than arching your lower back.'),
  (NULL, 'Single-Leg Glute Bridge', 'strength', ARRAY['glutes', 'hamstrings']::text[], ARRAY['bodyweight', 'mat']::text[], 'intermediate', 'From a glute bridge position, lift one foot off the floor and raise your hips using the other leg. Lower and repeat, then switch.', 'Keep your hips level as you lift.'),
  (NULL, 'Hip Thrust', 'strength', ARRAY['glutes', 'hamstrings']::text[], ARRAY['barbell', 'bench']::text[], 'intermediate', 'Sit with your upper back against a bench and a padded bar over your hips. Drive your hips up until your torso is level, pause, then lower.', 'Tuck your chin slightly and avoid overarching your lower back at the top.'),
  (NULL, 'Leg Curl', 'strength', ARRAY['hamstrings']::text[], ARRAY['machine']::text[], 'beginner', 'Set the pad just above your heels. Curl your heels towards your glutes, pause, then return slowly.', 'Don''t lift your hips off the pad. Control the lowering phase.'),
  (NULL, 'Leg Extension', 'strength', ARRAY['quads']::text[], ARRAY['machine']::text[], 'beginner', 'Sit with the pad on your lower shins. Straighten your knees to lift the pad, pause, then lower under control.', 'Use a pain-free range and moderate loads if your knees are sensitive.'),
  (NULL, 'Swiss Ball Hamstring Curl', 'strength', ARRAY['hamstrings', 'glutes']::text[], ARRAY['mat']::text[], 'intermediate', 'Lie on your back with heels on a stability ball. Lift your hips and roll the ball towards you by bending your knees, then roll it back out.', 'Keep your hips up through the movement. Start with fewer reps.'),
  (NULL, 'Standing Calf Raise', 'strength', ARRAY['calves']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Stand with the balls of your feet on a step. Rise onto your toes as high as you can, pause, then lower your heels below the step.', 'Hold a rail for balance. Move slowly at the bottom.'),
  (NULL, 'Single-Leg Calf Raise', 'strength', ARRAY['calves']::text[], ARRAY['bodyweight']::text[], 'intermediate', 'Stand on one foot on a step and rise onto your toes, then lower slowly. Switch sides.', 'Use a support for balance.'),
  (NULL, 'Seated Calf Raise', 'strength', ARRAY['calves']::text[], ARRAY['machine']::text[], 'beginner', 'Sit with the pad on your lower thighs and the balls of your feet on the platform. Raise your heels, pause, and lower fully.', 'Use a full, controlled range rather than bouncing.'),
  (NULL, 'Kettlebell Swing', 'strength', ARRAY['glutes', 'hamstrings', 'core']::text[], ARRAY['kettlebell']::text[], 'intermediate', 'Hinge and hike the kettlebell back between your legs, then snap your hips forward to swing it to chest height. Let it fall back into the next hinge.', 'The power comes from your hips, not your arms. Keep your back flat.'),
  (NULL, 'Lateral Band Walk', 'strength', ARRAY['glutes', 'hips']::text[], ARRAY['band']::text[], 'beginner', 'Place a band around your legs above the knees or ankles. In a half-squat, step sideways keeping tension in the band. Walk back the other way.', 'Keep your toes pointing forward and your knees from caving in.'),
  (NULL, 'Clamshell', 'strength', ARRAY['glutes', 'hips']::text[], ARRAY['band', 'mat']::text[], 'beginner', 'Lie on your side with knees bent and a band above your knees. Keeping your feet together, lift your top knee, pause, then lower.', 'Don''t roll your hips backwards as you lift.'),
  (NULL, 'Barbell Bench Press', 'strength', ARRAY['chest', 'triceps', 'shoulders']::text[], ARRAY['barbell', 'bench']::text[], 'intermediate', 'Lie on the bench with your eyes under the bar. Grip slightly wider than your shoulders, lower the bar to your mid-chest, then press it up.', 'Use safety arms or a spotter. Keep your feet planted and shoulder blades set.'),
  (NULL, 'Dumbbell Bench Press', 'strength', ARRAY['chest', 'triceps', 'shoulders']::text[], ARRAY['dumbbell', 'bench']::text[], 'beginner', 'Lie on a bench holding dumbbells over your chest. Lower them to the sides of your chest, then press back up.', 'Lower the weights to your chest before sitting up at the end of a set.'),
  (NULL, 'Incline Dumbbell Press', 'strength', ARRAY['chest', 'shoulders', 'triceps']::text[], ARRAY['dumbbell', 'bench']::text[], 'beginner', 'Set the bench to a low incline. Press the dumbbells up from the sides of your upper chest and lower them with control.', 'Keep your wrists stacked over your elbows.'),
  (NULL, 'Push-Up', 'strength', ARRAY['chest', 'triceps', 'core']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Place your hands under your shoulders in a plank. Lower your chest towards the floor as one straight line, then push back up.', 'Raise your hands on a bench to make it easier. Don''t let your hips sag.'),
  (NULL, 'Incline Push-Up', 'strength', ARRAY['chest', 'triceps']::text[], ARRAY['bench', 'bodyweight']::text[], 'beginner', 'With hands on a bench or wall, walk your feet back into a plank. Lower your chest to the edge and push away.', 'Make sure the surface is stable and won''t slide.'),
  (NULL, 'Dumbbell Chest Fly', 'strength', ARRAY['chest']::text[], ARRAY['dumbbell', 'bench']::text[], 'intermediate', 'Lie on a bench with dumbbells above your chest, elbows slightly bent. Open your arms wide until you feel a stretch, then bring them back together.', 'Use light weights and stop the lowering before your shoulders feel strained.'),
  (NULL, 'Cable Chest Fly', 'strength', ARRAY['chest']::text[], ARRAY['cable']::text[], 'intermediate', 'Stand between two cable handles set at shoulder height. With a slight bend in your elbows, bring your hands together in front of your chest, then return slowly.', 'Keep a staggered stance for balance and avoid overstretching.'),
  (NULL, 'Machine Chest Press', 'strength', ARRAY['chest', 'triceps']::text[], ARRAY['machine']::text[], 'beginner', 'Adjust the seat so the handles are at chest height. Press forward until your arms are nearly straight, then return slowly.', 'Keep your back against the pad.'),
  (NULL, 'Bench Dip', 'strength', ARRAY['triceps', 'chest']::text[], ARRAY['bench', 'bodyweight']::text[], 'intermediate', 'Sit on the edge of a bench, hands beside your hips. Slide off and lower your body by bending your elbows, then press back up.', 'Stop if you feel pain at the front of your shoulders; keep the range small.'),
  (NULL, 'Pull-Up', 'strength', ARRAY['back', 'biceps']::text[], ARRAY['pull_up_bar']::text[], 'advanced', 'Hang from the bar with an overhand grip. Pull your chest towards the bar by driving your elbows down, then lower to a full hang.', 'Use a band or an assisted machine until you can do controlled reps.'),
  (NULL, 'Assisted Pull-Up', 'strength', ARRAY['back', 'biceps']::text[], ARRAY['pull_up_bar', 'band']::text[], 'beginner', 'Loop a band over the bar and place a knee or foot in it. Pull up until your chin clears the bar, then lower slowly.', 'Check the band is secure before each set.'),
  (NULL, 'Chin-Up', 'strength', ARRAY['back', 'biceps']::text[], ARRAY['pull_up_bar']::text[], 'intermediate', 'Hang with an underhand, shoulder-width grip. Pull up until your chin is over the bar, then lower with control.', 'Avoid swinging; keep your core tight.'),
  (NULL, 'Lat Pulldown', 'strength', ARRAY['back', 'biceps']::text[], ARRAY['cable', 'machine']::text[], 'beginner', 'Sit with thighs under the pads and grip the bar wide. Pull it to your upper chest while keeping your torso tall, then let it rise slowly.', 'Don''t lean far back or pull the bar behind your neck.'),
  (NULL, 'Band Lat Pulldown', 'strength', ARRAY['back']::text[], ARRAY['band']::text[], 'beginner', 'Anchor a band overhead. Kneel or sit, hold the ends and pull your elbows down to your sides, then return.', 'Check the anchor point is secure.'),
  (NULL, 'Bent-Over Barbell Row', 'strength', ARRAY['back', 'biceps']::text[], ARRAY['barbell']::text[], 'intermediate', 'Hinge forward with a flat back, holding the bar below your knees. Row it to your lower ribs, pause, then lower.', 'Keep your back neutral; reduce the weight if you start to jerk.'),
  (NULL, 'One-Arm Dumbbell Row', 'strength', ARRAY['back', 'biceps']::text[], ARRAY['dumbbell', 'bench']::text[], 'beginner', 'Support one hand and knee on a bench. Pull the dumbbell towards your hip, pause, then lower it fully.', 'Keep your shoulders level and your back flat.'),
  (NULL, 'Seated Cable Row', 'strength', ARRAY['back', 'biceps']::text[], ARRAY['cable']::text[], 'beginner', 'Sit tall holding the handle with arms extended. Row it to your stomach, squeezing your shoulder blades together, then return slowly.', 'Don''t rock your torso to move the weight.'),
  (NULL, 'Band Row', 'strength', ARRAY['back', 'biceps']::text[], ARRAY['band']::text[], 'beginner', 'Anchor a band at chest height. Hold the ends, step back for tension and row your hands to your ribs.', 'Check the anchor and the band for wear before use.'),
  (NULL, 'Inverted Row', 'strength', ARRAY['back', 'biceps', 'core']::text[], ARRAY['barbell', 'bodyweight']::text[], 'intermediate', 'Lie under a bar set at waist height, hold it and keep your body straight. Pull your chest to the bar, then lower.', 'Bend your knees to make it easier.'),
  (NULL, 'Chest-Supported Dumbbell Row', 'strength', ARRAY['back']::text[], ARRAY['dumbbell', 'bench']::text[], 'beginner', 'Lie face down on an incline bench with dumbbells hanging down. Row them up beside your ribs, pause, and lower.', 'Keep your chest on the pad throughout.'),
  (NULL, 'Back Extension', 'strength', ARRAY['back', 'glutes', 'hamstrings']::text[], ARRAY['machine']::text[], 'beginner', 'Set the pad at your hips. Lower your torso with a straight back, then lift until your body is in line.', 'Don''t hyperextend at the top.'),
  (NULL, 'Overhead Press', 'strength', ARRAY['shoulders', 'triceps']::text[], ARRAY['barbell']::text[], 'intermediate', 'Hold the bar at shoulder height, brace your core and squeeze your glutes. Press it straight overhead, then lower to your shoulders.', 'Avoid leaning back; keep your ribs down.'),
  (NULL, 'Seated Dumbbell Shoulder Press', 'strength', ARRAY['shoulders', 'triceps']::text[], ARRAY['dumbbell', 'bench']::text[], 'beginner', 'Sit upright with dumbbells at shoulder height. Press them overhead until your arms are straight, then lower slowly.', 'Use a backrest and keep your lower back against it.'),
  (NULL, 'Band Shoulder Press', 'strength', ARRAY['shoulders', 'triceps']::text[], ARRAY['band']::text[], 'beginner', 'Stand on a band holding the ends at shoulder height. Press your hands overhead, then lower.', 'Keep the band secure under your feet.'),
  (NULL, 'Pike Push-Up', 'strength', ARRAY['shoulders', 'triceps']::text[], ARRAY['bodyweight']::text[], 'intermediate', 'From an inverted V position, bend your elbows to lower your head towards the floor, then press back up.', 'Move slowly and keep your neck neutral.'),
  (NULL, 'Dumbbell Lateral Raise', 'strength', ARRAY['shoulders']::text[], ARRAY['dumbbell']::text[], 'beginner', 'Hold light dumbbells at your sides. Raise your arms out to shoulder height with a slight bend in your elbows, then lower slowly.', 'Use light weights; don''t shrug your shoulders up.'),
  (NULL, 'Cable Lateral Raise', 'strength', ARRAY['shoulders']::text[], ARRAY['cable']::text[], 'intermediate', 'Stand side-on to a low cable. Raise the handle out to shoulder height, then lower with control.', 'Keep your torso still.'),
  (NULL, 'Band Lateral Raise', 'strength', ARRAY['shoulders']::text[], ARRAY['band']::text[], 'beginner', 'Stand on a band and hold an end in each hand. Raise your arms out to the sides to shoulder height, then lower.', 'Choose a light band to keep good form.'),
  (NULL, 'Face Pull', 'strength', ARRAY['shoulders', 'back']::text[], ARRAY['cable']::text[], 'beginner', 'Set a rope at face height. Pull it towards your face with elbows high, spreading the rope apart, then return.', 'Keep the weight light and the movement smooth.'),
  (NULL, 'Band Pull-Apart', 'strength', ARRAY['shoulders', 'back']::text[], ARRAY['band']::text[], 'beginner', 'Hold a band in front of you at shoulder height. Pull it apart until it touches your chest, then return slowly.', 'Keep your shoulders down and away from your ears.'),
  (NULL, 'Rear Delt Fly', 'strength', ARRAY['shoulders', 'back']::text[], ARRAY['dumbbell']::text[], 'beginner', 'Hinge forward with light dumbbells hanging down. Raise them out to the sides with soft elbows, then lower.', 'Keep your back flat and the weights light.'),
  (NULL, 'Dumbbell Biceps Curl', 'strength', ARRAY['biceps', 'forearms']::text[], ARRAY['dumbbell']::text[], 'beginner', 'Stand with dumbbells at your sides, palms forward. Curl them up keeping your elbows by your sides, then lower slowly.', 'Avoid swinging the weights with your back.'),
  (NULL, 'Hammer Curl', 'strength', ARRAY['biceps', 'forearms']::text[], ARRAY['dumbbell']::text[], 'beginner', 'Hold dumbbells with palms facing each other. Curl them up without moving your elbows, then lower.', 'Keep your wrists straight.'),
  (NULL, 'Barbell Curl', 'strength', ARRAY['biceps', 'forearms']::text[], ARRAY['barbell']::text[], 'beginner', 'Hold the bar with an underhand grip. Curl it towards your shoulders, then lower under control.', 'Keep your elbows close and your torso still.'),
  (NULL, 'Band Biceps Curl', 'strength', ARRAY['biceps']::text[], ARRAY['band']::text[], 'beginner', 'Stand on a band holding the ends. Curl your hands towards your shoulders, then lower.', 'Check the band is secure under your feet.'),
  (NULL, 'Triceps Pushdown', 'strength', ARRAY['triceps']::text[], ARRAY['cable']::text[], 'beginner', 'Stand facing a high cable with a rope or bar. Keeping your elbows at your sides, push the handle down until your arms are straight, then return.', 'Don''t let your elbows drift forward.'),
  (NULL, 'Overhead Dumbbell Triceps Extension', 'strength', ARRAY['triceps']::text[], ARRAY['dumbbell']::text[], 'beginner', 'Hold one dumbbell overhead with both hands. Lower it behind your head by bending your elbows, then extend back up.', 'Use a weight you can control; keep your ribs down.'),
  (NULL, 'Close-Grip Push-Up', 'strength', ARRAY['triceps', 'chest']::text[], ARRAY['bodyweight']::text[], 'intermediate', 'In a plank with hands just inside shoulder-width, lower your chest with elbows close to your body, then push up.', 'Elevate your hands to make it easier.'),
  (NULL, 'Farmer''s Carry', 'strength', ARRAY['forearms', 'core', 'full_body']::text[], ARRAY['dumbbell', 'kettlebell']::text[], 'beginner', 'Pick up a heavy weight in each hand and walk tall with short, steady steps for the set distance or time.', 'Lift the weights with a flat back and set them down the same way.'),
  (NULL, 'Suitcase Carry', 'strength', ARRAY['core', 'forearms']::text[], ARRAY['dumbbell', 'kettlebell']::text[], 'intermediate', 'Hold one weight at your side and walk without leaning towards it. Switch hands halfway.', 'Stay upright; reduce the weight if you tilt.'),
  (NULL, 'Plank', 'strength', ARRAY['core']::text[], ARRAY['bodyweight', 'mat']::text[], 'beginner', 'Rest on your forearms and toes with your body in a straight line. Brace your stomach and hold.', 'Don''t let your hips sag or pike up. Drop to your knees if needed.'),
  (NULL, 'Side Plank', 'strength', ARRAY['core', 'hips']::text[], ARRAY['bodyweight', 'mat']::text[], 'beginner', 'Lie on one side and lift your hips so your body forms a straight line from head to feet, supported on your forearm. Hold, then switch.', 'Bend your knees to make it easier.'),
  (NULL, 'Dead Bug', 'strength', ARRAY['core']::text[], ARRAY['bodyweight', 'mat']::text[], 'beginner', 'Lie on your back with arms up and knees bent at 90 degrees. Slowly lower the opposite arm and leg towards the floor, return, and switch.', 'Keep your lower back pressed gently into the floor.'),
  (NULL, 'Bird Dog', 'strength', ARRAY['core', 'back', 'glutes']::text[], ARRAY['bodyweight', 'mat']::text[], 'beginner', 'On hands and knees, reach one arm forward and the opposite leg back until both are level. Pause, return, and switch.', 'Move slowly and keep your hips level.'),
  (NULL, 'Hanging Knee Raise', 'strength', ARRAY['core']::text[], ARRAY['pull_up_bar']::text[], 'intermediate', 'Hang from a bar and lift your knees towards your chest without swinging, then lower slowly.', 'Use a captain''s chair or lying version if your grip tires first.'),
  (NULL, 'Reverse Crunch', 'strength', ARRAY['core']::text[], ARRAY['bodyweight', 'mat']::text[], 'beginner', 'Lie on your back with knees bent. Curl your hips off the floor bringing your knees towards your chest, then lower slowly.', 'Use your abs rather than swinging your legs.'),
  (NULL, 'Crunch', 'strength', ARRAY['core']::text[], ARRAY['bodyweight', 'mat']::text[], 'beginner', 'Lie on your back, knees bent. Curl your shoulders off the floor towards your hips, then lower.', 'Don''t pull on your neck; keep your chin slightly tucked.'),
  (NULL, 'Russian Twist', 'strength', ARRAY['core']::text[], ARRAY['bodyweight', 'mat']::text[], 'intermediate', 'Sit with knees bent and lean back slightly. Rotate your torso from side to side, touching the floor beside your hips.', 'Keep your back long; keep your feet down if your back feels strained.'),
  (NULL, 'Pallof Press', 'strength', ARRAY['core']::text[], ARRAY['cable', 'band']::text[], 'beginner', 'Stand side-on to a cable or band at chest height. Hold the handle at your chest and press it straight out without letting it pull you round, then return.', 'Stand tall and keep your hips square.'),
  (NULL, 'Mountain Climber', 'cardio', ARRAY['core', 'full_body']::text[], ARRAY['bodyweight']::text[], 'beginner', 'From a high plank, drive one knee towards your chest, then quickly switch legs in a running rhythm.', 'Keep your hips level and your hands under your shoulders.'),
  (NULL, 'Ab Wheel Rollout', 'strength', ARRAY['core']::text[], ARRAY['mat']::text[], 'advanced', 'Kneel holding an ab wheel. Roll it forward slowly as far as you can while keeping your back neutral, then pull back.', 'Start with a short range and don''t let your lower back sag.'),
  (NULL, 'Jumping Jack', 'cardio', ARRAY['full_body']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Jump your feet out while raising your arms overhead, then jump back to the start. Keep a steady rhythm.', 'Land softly. Step side to side instead for a low-impact option.'),
  (NULL, 'Step Jack', 'cardio', ARRAY['full_body']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Step one foot out to the side while raising your arms, step back, then switch sides. A low-impact version of the jumping jack.', 'Keep a comfortable pace you can breathe through.'),
  (NULL, 'Marching in Place', 'cardio', ARRAY['full_body']::text[], ARRAY['bodyweight']::text[], 'beginner', 'March on the spot, lifting your knees to a comfortable height and swinging your arms.', 'Hold a support if balance is a concern.'),
  (NULL, 'High Knees', 'cardio', ARRAY['full_body', 'quads']::text[], ARRAY['bodyweight']::text[], 'intermediate', 'Run on the spot, driving your knees up to hip height and pumping your arms.', 'Stay on the balls of your feet; march instead for lower impact.'),
  (NULL, 'Burpee', 'plyometric', ARRAY['full_body']::text[], ARRAY['bodyweight']::text[], 'intermediate', 'From standing, squat and place your hands down, jump or step your feet back to a plank, return, and stand or jump up.', 'Step back instead of jumping for a lower-impact version.'),
  (NULL, 'Squat Thrust', 'cardio', ARRAY['full_body']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Squat and place your hands on the floor, step or hop your feet back to a plank, then return and stand up.', 'Keep your back flat in the plank.'),
  (NULL, 'Jump Squat', 'plyometric', ARRAY['quads', 'glutes']::text[], ARRAY['bodyweight']::text[], 'intermediate', 'Squat down, then jump up explosively. Land softly with bent knees straight into the next squat.', 'Land quietly with knees tracking over toes. Skip if you have knee pain.'),
  (NULL, 'Box Jump', 'plyometric', ARRAY['quads', 'glutes', 'calves']::text[], ARRAY['box']::text[], 'advanced', 'Stand in front of a sturdy box. Swing your arms, jump onto the box landing softly in a squat, stand, then step down.', 'Step down rather than jumping down. Choose a low box first.'),
  (NULL, 'Skater Hop', 'plyometric', ARRAY['glutes', 'quads']::text[], ARRAY['bodyweight']::text[], 'intermediate', 'Leap sideways from one foot to the other, landing softly and swinging your arms across.', 'Shorten the hop or step it out for a gentler version.'),
  (NULL, 'Jump Rope', 'cardio', ARRAY['calves', 'full_body']::text[], ARRAY['bodyweight']::text[], 'intermediate', 'Turn the rope with your wrists and jump just high enough to clear it, landing on the balls of your feet.', 'Use a clear space and supportive shoes.'),
  (NULL, 'Treadmill Walk', 'cardio', ARRAY['full_body']::text[], ARRAY['cardio_machine']::text[], 'beginner', 'Walk at a brisk pace on the treadmill. Add a slight incline to make it harder.', 'Use the safety clip and hold the rails only when needed.'),
  (NULL, 'Brisk Walk', 'cardio', ARRAY['full_body']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Walk outdoors or indoors at a pace where you can talk but not sing.', 'Wear supportive shoes and stay hydrated.'),
  (NULL, 'Treadmill Run', 'cardio', ARRAY['full_body']::text[], ARRAY['cardio_machine']::text[], 'intermediate', 'Run at a steady, conversational pace, or alternate faster and easier intervals as programmed.', 'Warm up first and use the safety clip.'),
  (NULL, 'Stationary Bike', 'cardio', ARRAY['quads', 'full_body']::text[], ARRAY['cardio_machine']::text[], 'beginner', 'Set the seat so your knee is slightly bent at the bottom. Pedal at a steady pace or in intervals.', 'Adjust resistance gradually.'),
  (NULL, 'Rowing Machine', 'cardio', ARRAY['back', 'full_body']::text[], ARRAY['cardio_machine']::text[], 'intermediate', 'Push with your legs, then lean back slightly and pull the handle to your lower ribs. Return in the reverse order.', 'Drive with your legs first; keep your back straight.'),
  (NULL, 'Elliptical', 'cardio', ARRAY['full_body']::text[], ARRAY['cardio_machine']::text[], 'beginner', 'Move in a smooth stride on the elliptical, using the handles to involve your arms.', 'Keep an upright posture.'),
  (NULL, 'Cat-Cow', 'mobility', ARRAY['back', 'core']::text[], ARRAY['mat']::text[], 'beginner', 'On hands and knees, slowly round your back towards the ceiling, then let it drop as you lift your chest. Move with your breath.', 'Move gently within a comfortable range.'),
  (NULL, 'Child''s Pose', 'mobility', ARRAY['back', 'hips']::text[], ARRAY['mat']::text[], 'beginner', 'Kneel, sit your hips back towards your heels and reach your arms forward along the floor. Breathe slowly.', 'Place a cushion under your knees or hips if needed.'),
  (NULL, 'World''s Greatest Stretch', 'mobility', ARRAY['hips', 'hamstrings', 'back']::text[], ARRAY['bodyweight']::text[], 'intermediate', 'Step into a deep lunge, place the same-side hand inside your front foot, rotate your other arm towards the ceiling, then switch sides.', 'Move slowly and stay in a pain-free range.'),
  (NULL, 'Hip Flexor Stretch', 'mobility', ARRAY['hips', 'quads']::text[], ARRAY['mat']::text[], 'beginner', 'Kneel in a half-kneeling position. Tuck your pelvis and shift forward until you feel a stretch at the front of your back hip. Hold, then switch.', 'Pad your knee; don''t arch your lower back.'),
  (NULL, 'Pigeon Stretch', 'mobility', ARRAY['hips', 'glutes']::text[], ARRAY['mat']::text[], 'intermediate', 'From hands and knees, bring one knee forward behind your wrist and extend the other leg back. Lower your hips and hold, then switch.', 'Use a cushion under your hip; ease off if your knee hurts.'),
  (NULL, 'Figure-Four Stretch', 'mobility', ARRAY['hips', 'glutes']::text[], ARRAY['mat']::text[], 'beginner', 'Lie on your back and cross one ankle over the opposite knee. Pull the lower leg towards you until you feel a stretch in your hip.', 'Keep your head and shoulders relaxed on the floor.'),
  (NULL, 'Hamstring Stretch', 'mobility', ARRAY['hamstrings']::text[], ARRAY['mat']::text[], 'beginner', 'Lie on your back and raise one straight leg, holding behind your thigh or using a strap, until you feel a stretch. Hold, then switch.', 'Keep the other leg relaxed and avoid bouncing.'),
  (NULL, 'Thoracic Rotation', 'mobility', ARRAY['back', 'shoulders']::text[], ARRAY['mat']::text[], 'beginner', 'Lie on your side with knees bent and arms out in front. Open the top arm across your body towards the floor behind you, following it with your eyes. Return and repeat.', 'Keep your knees together and move slowly.'),
  (NULL, 'Shoulder Dislocate with Band', 'mobility', ARRAY['shoulders']::text[], ARRAY['band']::text[], 'intermediate', 'Hold a light band wide in front of you. Keeping your arms straight, lift it over your head and behind you, then return.', 'Use a wide grip and a light band; never force the range.'),
  (NULL, 'Doorway Chest Stretch', 'mobility', ARRAY['chest', 'shoulders']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Place your forearm on a door frame with your elbow at shoulder height. Step through gently until you feel a stretch across your chest. Hold, then switch.', 'Ease in slowly and avoid pain in the shoulder.'),
  (NULL, 'Ankle Mobility Drill', 'mobility', ARRAY['calves']::text[], ARRAY['bodyweight']::text[], 'beginner', 'Face a wall in a half-kneel. Drive your front knee forward over your toes towards the wall, keeping your heel down, then return.', 'Keep your heel planted and move in a comfortable range.'),
  (NULL, 'Glute Bridge March', 'strength', ARRAY['glutes', 'core']::text[], ARRAY['bodyweight', 'mat']::text[], 'beginner', 'Hold a glute bridge and slowly lift one foot a few centimetres, set it down, then lift the other, keeping your hips level.', 'Keep your hips from dropping as you switch.'),
  (NULL, 'Foam Roll: Quads', 'mobility', ARRAY['quads']::text[], ARRAY['mat']::text[], 'beginner', 'Lie face down with a foam roller under your thighs. Roll slowly from above your knees to your hips, pausing on tight spots.', 'Avoid rolling directly over joints or bruised areas.'),
  (NULL, 'Foam Roll: Upper Back', 'mobility', ARRAY['back']::text[], ARRAY['mat']::text[], 'beginner', 'Lie with a foam roller under your upper back and hands supporting your head. Roll slowly between your shoulder blades.', 'Don''t roll your lower back or neck.');

-- Substitutions, by name within the global library.
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Goblet Squat', 'Leg Press') ORDER BY array_position(ARRAY['Goblet Squat', 'Leg Press']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Barbell Back Squat';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Goblet Squat', 'Barbell Back Squat') ORDER BY array_position(ARRAY['Goblet Squat', 'Barbell Back Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Front Squat';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Bodyweight Squat', 'Barbell Back Squat') ORDER BY array_position(ARRAY['Bodyweight Squat', 'Barbell Back Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Goblet Squat';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Goblet Squat', 'Box Squat') ORDER BY array_position(ARRAY['Goblet Squat', 'Box Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Bodyweight Squat';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Bodyweight Squat', 'Goblet Squat') ORDER BY array_position(ARRAY['Bodyweight Squat', 'Goblet Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Box Squat';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Goblet Squat', 'Barbell Back Squat') ORDER BY array_position(ARRAY['Goblet Squat', 'Barbell Back Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Leg Press';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Romanian Deadlift', 'Glute Bridge') ORDER BY array_position(ARRAY['Dumbbell Romanian Deadlift', 'Glute Bridge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Romanian Deadlift';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Romanian Deadlift', 'Kettlebell Swing') ORDER BY array_position(ARRAY['Romanian Deadlift', 'Kettlebell Swing']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Dumbbell Romanian Deadlift';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Trap Bar Deadlift', 'Romanian Deadlift') ORDER BY array_position(ARRAY['Trap Bar Deadlift', 'Romanian Deadlift']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Conventional Deadlift';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Conventional Deadlift', 'Goblet Squat') ORDER BY array_position(ARRAY['Conventional Deadlift', 'Goblet Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Trap Bar Deadlift';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Reverse Lunge', 'Split Squat') ORDER BY array_position(ARRAY['Reverse Lunge', 'Split Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Walking Lunge';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Walking Lunge', 'Split Squat') ORDER BY array_position(ARRAY['Walking Lunge', 'Split Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Reverse Lunge';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Reverse Lunge', 'Bulgarian Split Squat') ORDER BY array_position(ARRAY['Reverse Lunge', 'Bulgarian Split Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Dumbbell Reverse Lunge';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Reverse Lunge', 'Bulgarian Split Squat') ORDER BY array_position(ARRAY['Reverse Lunge', 'Bulgarian Split Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Split Squat';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Split Squat', 'Step-Up') ORDER BY array_position(ARRAY['Split Squat', 'Step-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Bulgarian Split Squat';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Split Squat', 'Reverse Lunge') ORDER BY array_position(ARRAY['Split Squat', 'Reverse Lunge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Step-Up';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Hip Thrust', 'Single-Leg Glute Bridge') ORDER BY array_position(ARRAY['Hip Thrust', 'Single-Leg Glute Bridge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Glute Bridge';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Glute Bridge', 'Hip Thrust') ORDER BY array_position(ARRAY['Glute Bridge', 'Hip Thrust']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Single-Leg Glute Bridge';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Glute Bridge', 'Single-Leg Glute Bridge') ORDER BY array_position(ARRAY['Glute Bridge', 'Single-Leg Glute Bridge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Hip Thrust';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Swiss Ball Hamstring Curl', 'Romanian Deadlift') ORDER BY array_position(ARRAY['Swiss Ball Hamstring Curl', 'Romanian Deadlift']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Leg Curl';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Split Squat', 'Goblet Squat') ORDER BY array_position(ARRAY['Split Squat', 'Goblet Squat']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Leg Extension';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Leg Curl', 'Glute Bridge') ORDER BY array_position(ARRAY['Leg Curl', 'Glute Bridge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Swiss Ball Hamstring Curl';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Seated Calf Raise', 'Single-Leg Calf Raise') ORDER BY array_position(ARRAY['Seated Calf Raise', 'Single-Leg Calf Raise']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Standing Calf Raise';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Standing Calf Raise', 'Seated Calf Raise') ORDER BY array_position(ARRAY['Standing Calf Raise', 'Seated Calf Raise']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Single-Leg Calf Raise';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Standing Calf Raise', 'Single-Leg Calf Raise') ORDER BY array_position(ARRAY['Standing Calf Raise', 'Single-Leg Calf Raise']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Seated Calf Raise';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Romanian Deadlift', 'Glute Bridge') ORDER BY array_position(ARRAY['Dumbbell Romanian Deadlift', 'Glute Bridge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Kettlebell Swing';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Clamshell', 'Glute Bridge') ORDER BY array_position(ARRAY['Clamshell', 'Glute Bridge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Lateral Band Walk';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Lateral Band Walk', 'Glute Bridge') ORDER BY array_position(ARRAY['Lateral Band Walk', 'Glute Bridge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Clamshell';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Bench Press', 'Push-Up') ORDER BY array_position(ARRAY['Dumbbell Bench Press', 'Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Barbell Bench Press';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Barbell Bench Press', 'Push-Up') ORDER BY array_position(ARRAY['Barbell Bench Press', 'Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Dumbbell Bench Press';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Bench Press', 'Incline Push-Up') ORDER BY array_position(ARRAY['Dumbbell Bench Press', 'Incline Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Incline Dumbbell Press';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Incline Push-Up', 'Dumbbell Bench Press') ORDER BY array_position(ARRAY['Incline Push-Up', 'Dumbbell Bench Press']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Push-Up';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Push-Up', 'Dumbbell Bench Press') ORDER BY array_position(ARRAY['Push-Up', 'Dumbbell Bench Press']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Incline Push-Up';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Cable Chest Fly', 'Push-Up') ORDER BY array_position(ARRAY['Cable Chest Fly', 'Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Dumbbell Chest Fly';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Chest Fly', 'Push-Up') ORDER BY array_position(ARRAY['Dumbbell Chest Fly', 'Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Cable Chest Fly';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Bench Press', 'Push-Up') ORDER BY array_position(ARRAY['Dumbbell Bench Press', 'Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Machine Chest Press';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Close-Grip Push-Up', 'Triceps Pushdown') ORDER BY array_position(ARRAY['Close-Grip Push-Up', 'Triceps Pushdown']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Bench Dip';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Assisted Pull-Up', 'Lat Pulldown') ORDER BY array_position(ARRAY['Assisted Pull-Up', 'Lat Pulldown']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Pull-Up';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Lat Pulldown', 'Pull-Up') ORDER BY array_position(ARRAY['Lat Pulldown', 'Pull-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Assisted Pull-Up';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Assisted Pull-Up', 'Lat Pulldown') ORDER BY array_position(ARRAY['Assisted Pull-Up', 'Lat Pulldown']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Chin-Up';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Assisted Pull-Up', 'Band Lat Pulldown') ORDER BY array_position(ARRAY['Assisted Pull-Up', 'Band Lat Pulldown']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Lat Pulldown';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Lat Pulldown', 'Assisted Pull-Up') ORDER BY array_position(ARRAY['Lat Pulldown', 'Assisted Pull-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Band Lat Pulldown';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('One-Arm Dumbbell Row', 'Seated Cable Row') ORDER BY array_position(ARRAY['One-Arm Dumbbell Row', 'Seated Cable Row']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Bent-Over Barbell Row';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Bent-Over Barbell Row', 'Seated Cable Row') ORDER BY array_position(ARRAY['Bent-Over Barbell Row', 'Seated Cable Row']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'One-Arm Dumbbell Row';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('One-Arm Dumbbell Row', 'Band Row') ORDER BY array_position(ARRAY['One-Arm Dumbbell Row', 'Band Row']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Seated Cable Row';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Seated Cable Row', 'One-Arm Dumbbell Row') ORDER BY array_position(ARRAY['Seated Cable Row', 'One-Arm Dumbbell Row']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Band Row';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Seated Cable Row', 'Band Row') ORDER BY array_position(ARRAY['Seated Cable Row', 'Band Row']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Inverted Row';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('One-Arm Dumbbell Row', 'Seated Cable Row') ORDER BY array_position(ARRAY['One-Arm Dumbbell Row', 'Seated Cable Row']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Chest-Supported Dumbbell Row';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Bird Dog', 'Glute Bridge') ORDER BY array_position(ARRAY['Bird Dog', 'Glute Bridge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Back Extension';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Seated Dumbbell Shoulder Press', 'Pike Push-Up') ORDER BY array_position(ARRAY['Seated Dumbbell Shoulder Press', 'Pike Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Overhead Press';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Overhead Press', 'Band Shoulder Press') ORDER BY array_position(ARRAY['Overhead Press', 'Band Shoulder Press']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Seated Dumbbell Shoulder Press';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Seated Dumbbell Shoulder Press', 'Pike Push-Up') ORDER BY array_position(ARRAY['Seated Dumbbell Shoulder Press', 'Pike Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Band Shoulder Press';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Seated Dumbbell Shoulder Press', 'Push-Up') ORDER BY array_position(ARRAY['Seated Dumbbell Shoulder Press', 'Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Pike Push-Up';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Cable Lateral Raise', 'Band Lateral Raise') ORDER BY array_position(ARRAY['Cable Lateral Raise', 'Band Lateral Raise']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Dumbbell Lateral Raise';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Lateral Raise', 'Band Lateral Raise') ORDER BY array_position(ARRAY['Dumbbell Lateral Raise', 'Band Lateral Raise']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Cable Lateral Raise';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Lateral Raise', 'Cable Lateral Raise') ORDER BY array_position(ARRAY['Dumbbell Lateral Raise', 'Cable Lateral Raise']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Band Lateral Raise';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Band Pull-Apart', 'Rear Delt Fly') ORDER BY array_position(ARRAY['Band Pull-Apart', 'Rear Delt Fly']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Face Pull';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Face Pull', 'Rear Delt Fly') ORDER BY array_position(ARRAY['Face Pull', 'Rear Delt Fly']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Band Pull-Apart';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Band Pull-Apart', 'Face Pull') ORDER BY array_position(ARRAY['Band Pull-Apart', 'Face Pull']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Rear Delt Fly';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Hammer Curl', 'Band Biceps Curl') ORDER BY array_position(ARRAY['Hammer Curl', 'Band Biceps Curl']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Dumbbell Biceps Curl';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Biceps Curl', 'Band Biceps Curl') ORDER BY array_position(ARRAY['Dumbbell Biceps Curl', 'Band Biceps Curl']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Hammer Curl';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Biceps Curl', 'Hammer Curl') ORDER BY array_position(ARRAY['Dumbbell Biceps Curl', 'Hammer Curl']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Barbell Curl';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dumbbell Biceps Curl', 'Hammer Curl') ORDER BY array_position(ARRAY['Dumbbell Biceps Curl', 'Hammer Curl']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Band Biceps Curl';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Overhead Dumbbell Triceps Extension', 'Bench Dip') ORDER BY array_position(ARRAY['Overhead Dumbbell Triceps Extension', 'Bench Dip']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Triceps Pushdown';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Triceps Pushdown', 'Close-Grip Push-Up') ORDER BY array_position(ARRAY['Triceps Pushdown', 'Close-Grip Push-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Overhead Dumbbell Triceps Extension';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Push-Up', 'Bench Dip') ORDER BY array_position(ARRAY['Push-Up', 'Bench Dip']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Close-Grip Push-Up';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Suitcase Carry', 'Plank') ORDER BY array_position(ARRAY['Suitcase Carry', 'Plank']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Farmer''s Carry';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Farmer''s Carry', 'Side Plank') ORDER BY array_position(ARRAY['Farmer''s Carry', 'Side Plank']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Suitcase Carry';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dead Bug', 'Bird Dog') ORDER BY array_position(ARRAY['Dead Bug', 'Bird Dog']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Plank';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Plank', 'Suitcase Carry') ORDER BY array_position(ARRAY['Plank', 'Suitcase Carry']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Side Plank';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Plank', 'Bird Dog') ORDER BY array_position(ARRAY['Plank', 'Bird Dog']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Dead Bug';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dead Bug', 'Plank') ORDER BY array_position(ARRAY['Dead Bug', 'Plank']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Bird Dog';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Reverse Crunch', 'Dead Bug') ORDER BY array_position(ARRAY['Reverse Crunch', 'Dead Bug']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Hanging Knee Raise';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Dead Bug', 'Hanging Knee Raise') ORDER BY array_position(ARRAY['Dead Bug', 'Hanging Knee Raise']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Reverse Crunch';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Reverse Crunch', 'Dead Bug') ORDER BY array_position(ARRAY['Reverse Crunch', 'Dead Bug']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Crunch';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Pallof Press', 'Side Plank') ORDER BY array_position(ARRAY['Pallof Press', 'Side Plank']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Russian Twist';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Side Plank', 'Dead Bug') ORDER BY array_position(ARRAY['Side Plank', 'Dead Bug']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Pallof Press';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Plank', 'High Knees') ORDER BY array_position(ARRAY['Plank', 'High Knees']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Mountain Climber';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Plank', 'Dead Bug') ORDER BY array_position(ARRAY['Plank', 'Dead Bug']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Ab Wheel Rollout';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('High Knees', 'Step Jack') ORDER BY array_position(ARRAY['High Knees', 'Step Jack']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Jumping Jack';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Jumping Jack', 'Marching in Place') ORDER BY array_position(ARRAY['Jumping Jack', 'Marching in Place']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Step Jack';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Step Jack', 'High Knees') ORDER BY array_position(ARRAY['Step Jack', 'High Knees']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Marching in Place';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Marching in Place', 'Mountain Climber') ORDER BY array_position(ARRAY['Marching in Place', 'Mountain Climber']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'High Knees';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Squat Thrust', 'Mountain Climber') ORDER BY array_position(ARRAY['Squat Thrust', 'Mountain Climber']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Burpee';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Burpee', 'Mountain Climber') ORDER BY array_position(ARRAY['Burpee', 'Mountain Climber']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Squat Thrust';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Bodyweight Squat', 'Box Jump') ORDER BY array_position(ARRAY['Bodyweight Squat', 'Box Jump']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Jump Squat';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Jump Squat', 'Step-Up') ORDER BY array_position(ARRAY['Jump Squat', 'Step-Up']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Box Jump';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Lateral Band Walk', 'Reverse Lunge') ORDER BY array_position(ARRAY['Lateral Band Walk', 'Reverse Lunge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Skater Hop';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Jumping Jack', 'High Knees') ORDER BY array_position(ARRAY['Jumping Jack', 'High Knees']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Jump Rope';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Brisk Walk', 'Stationary Bike') ORDER BY array_position(ARRAY['Brisk Walk', 'Stationary Bike']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Treadmill Walk';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Treadmill Walk', 'Marching in Place') ORDER BY array_position(ARRAY['Treadmill Walk', 'Marching in Place']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Brisk Walk';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Treadmill Walk', 'Stationary Bike') ORDER BY array_position(ARRAY['Treadmill Walk', 'Stationary Bike']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Treadmill Run';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Rowing Machine', 'Treadmill Walk') ORDER BY array_position(ARRAY['Rowing Machine', 'Treadmill Walk']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Stationary Bike';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Stationary Bike', 'Seated Cable Row') ORDER BY array_position(ARRAY['Stationary Bike', 'Seated Cable Row']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Rowing Machine';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Stationary Bike', 'Treadmill Walk') ORDER BY array_position(ARRAY['Stationary Bike', 'Treadmill Walk']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Elliptical';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Child''s Pose', 'Thoracic Rotation') ORDER BY array_position(ARRAY['Child''s Pose', 'Thoracic Rotation']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Cat-Cow';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Cat-Cow', 'Hip Flexor Stretch') ORDER BY array_position(ARRAY['Cat-Cow', 'Hip Flexor Stretch']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Child''s Pose';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Hip Flexor Stretch', 'Thoracic Rotation') ORDER BY array_position(ARRAY['Hip Flexor Stretch', 'Thoracic Rotation']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'World''s Greatest Stretch';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('World''s Greatest Stretch', 'Pigeon Stretch') ORDER BY array_position(ARRAY['World''s Greatest Stretch', 'Pigeon Stretch']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Hip Flexor Stretch';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Figure-Four Stretch', 'Hip Flexor Stretch') ORDER BY array_position(ARRAY['Figure-Four Stretch', 'Hip Flexor Stretch']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Pigeon Stretch';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Pigeon Stretch', 'Child''s Pose') ORDER BY array_position(ARRAY['Pigeon Stretch', 'Child''s Pose']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Figure-Four Stretch';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('World''s Greatest Stretch', 'Dumbbell Romanian Deadlift') ORDER BY array_position(ARRAY['World''s Greatest Stretch', 'Dumbbell Romanian Deadlift']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Hamstring Stretch';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Cat-Cow', 'World''s Greatest Stretch') ORDER BY array_position(ARRAY['Cat-Cow', 'World''s Greatest Stretch']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Thoracic Rotation';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Band Pull-Apart', 'Doorway Chest Stretch') ORDER BY array_position(ARRAY['Band Pull-Apart', 'Doorway Chest Stretch']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Shoulder Dislocate with Band';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Shoulder Dislocate with Band', 'Thoracic Rotation') ORDER BY array_position(ARRAY['Shoulder Dislocate with Band', 'Thoracic Rotation']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Doorway Chest Stretch';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Standing Calf Raise', 'Hip Flexor Stretch') ORDER BY array_position(ARRAY['Standing Calf Raise', 'Hip Flexor Stretch']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Ankle Mobility Drill';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Glute Bridge', 'Single-Leg Glute Bridge') ORDER BY array_position(ARRAY['Glute Bridge', 'Single-Leg Glute Bridge']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Glute Bridge March';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Hip Flexor Stretch', 'World''s Greatest Stretch') ORDER BY array_position(ARRAY['Hip Flexor Stretch', 'World''s Greatest Stretch']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Foam Roll: Quads';
UPDATE exercises SET substitution_ids = ARRAY(SELECT s.id FROM exercises s WHERE s.workspace_id IS NULL AND s.name IN ('Thoracic Rotation', 'Cat-Cow') ORDER BY array_position(ARRAY['Thoracic Rotation', 'Cat-Cow']::text[], s.name)) WHERE workspace_id IS NULL AND name = 'Foam Roll: Upper Back';

-- Beginner Full Body 3×/week
WITH p AS (INSERT INTO programs (workspace_id, name, description, goal, duration_weeks, days_per_week, is_template, sort_order) VALUES (NULL, 'Beginner Full Body 3×/week', 'Three full-body sessions a week built on basic movement patterns: squat, hinge, push, pull and core. A starting point for clients new to resistance training; adjust loads and reps to the client.', 'improve_fitness', 8, 3, true, 1) RETURNING id)
INSERT INTO program_workouts (workspace_id, program_id, name, day_number, position, notes) SELECT NULL, p.id, w.name, w.day_number, w.position, w.notes FROM p, (VALUES
  ('Full Body A', 1, 1, 'Leave a rest day between sessions.'),
  ('Full Body B', 3, 2, NULL),
  ('Full Body C', 5, 3, NULL)
) AS w(name, day_number, position, notes);
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Goblet Squat', 1, 3, 8, 12, NULL, 90),
  ('Incline Push-Up', 2, 3, 8, 12, NULL, 60),
  ('Lat Pulldown', 3, 3, 10, 12, NULL, 60),
  ('Glute Bridge', 4, 3, 12, 12, NULL, 60),
  ('Plank', 5, 3, NULL, NULL, 30, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Full Body A'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Beginner Full Body 3×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Dumbbell Romanian Deadlift', 1, 3, 10, 12, NULL, 90),
  ('Seated Dumbbell Shoulder Press', 2, 3, 8, 12, NULL, 60),
  ('Seated Cable Row', 3, 3, 10, 12, NULL, 60),
  ('Reverse Lunge', 4, 2, 8, 10, NULL, 60),
  ('Dead Bug', 5, 3, 8, 10, NULL, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Full Body B'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Beginner Full Body 3×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Leg Press', 1, 3, 10, 12, NULL, 90),
  ('Dumbbell Bench Press', 2, 3, 8, 12, NULL, 60),
  ('One-Arm Dumbbell Row', 3, 3, 10, 12, NULL, 60),
  ('Step-Up', 4, 2, 8, 10, NULL, 60),
  ('Bird Dog', 5, 3, 8, 10, NULL, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Full Body C'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Beginner Full Body 3×/week';

-- Fat Loss Circuit 4×/week
WITH p AS (INSERT INTO programs (workspace_id, name, description, goal, duration_weeks, days_per_week, is_template, sort_order) VALUES (NULL, 'Fat Loss Circuit 4×/week', 'Four circuit-style sessions a week alternating strength and conditioning work with short rests. Pair with the client''s nutrition and daily activity plan; scale the impact to the client.', 'lose_weight', 6, 4, true, 2) RETURNING id)
INSERT INTO program_workouts (workspace_id, program_id, name, day_number, position, notes) SELECT NULL, p.id, w.name, w.day_number, w.position, w.notes FROM p, (VALUES
  ('Circuit A: Lower + Conditioning', 1, 1, 'Move through the exercises as a circuit; rest after each round.'),
  ('Circuit B: Upper + Conditioning', 2, 2, NULL),
  ('Circuit C: Full Body', 4, 3, NULL),
  ('Steady Cardio', 6, 4, 'Keep a pace where talking is possible.')
) AS w(name, day_number, position, notes);
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Goblet Squat', 1, 3, 12, 12, NULL, 30),
  ('Kettlebell Swing', 2, 3, 15, 15, NULL, 30),
  ('Walking Lunge', 3, 3, 10, 10, NULL, 30),
  ('Mountain Climber', 4, 3, NULL, NULL, 30, 30),
  ('Plank', 5, 3, NULL, NULL, 30, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Circuit A: Lower + Conditioning'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Fat Loss Circuit 4×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Push-Up', 1, 3, 10, 10, NULL, 30),
  ('Band Row', 2, 3, 15, 15, NULL, 30),
  ('Seated Dumbbell Shoulder Press', 3, 3, 12, 12, NULL, 30),
  ('Jumping Jack', 4, 3, NULL, NULL, 40, 30),
  ('Dead Bug', 5, 3, 10, 10, NULL, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Circuit B: Upper + Conditioning'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Fat Loss Circuit 4×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Dumbbell Romanian Deadlift', 1, 3, 12, 12, NULL, 30),
  ('Squat Thrust', 2, 3, 10, 10, NULL, 30),
  ('One-Arm Dumbbell Row', 3, 3, 12, 12, NULL, 30),
  ('Step-Up', 4, 3, 10, 10, NULL, 30),
  ('Russian Twist', 5, 3, 20, 20, NULL, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Circuit C: Full Body'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Fat Loss Circuit 4×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Stationary Bike', 1, 1, NULL, NULL, 1200, 0),
  ('Brisk Walk', 2, 1, NULL, NULL, 900, 0)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Steady Cardio'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Fat Loss Circuit 4×/week';

-- Upper/Lower 4×/week
WITH p AS (INSERT INTO programs (workspace_id, name, description, goal, duration_weeks, days_per_week, is_template, sort_order) VALUES (NULL, 'Upper/Lower 4×/week', 'Four sessions a week split into two upper-body and two lower-body days, with a heavier and a lighter day for each. For clients comfortable with the main lifts.', 'build_muscle', 8, 4, true, 3) RETURNING id)
INSERT INTO program_workouts (workspace_id, program_id, name, day_number, position, notes) SELECT NULL, p.id, w.name, w.day_number, w.position, w.notes FROM p, (VALUES
  ('Upper A', 1, 1, NULL),
  ('Lower A', 2, 2, NULL),
  ('Upper B', 4, 3, NULL),
  ('Lower B', 5, 4, NULL)
) AS w(name, day_number, position, notes);
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Barbell Bench Press', 1, 4, 6, 8, NULL, 120),
  ('Bent-Over Barbell Row', 2, 4, 6, 8, NULL, 120),
  ('Seated Dumbbell Shoulder Press', 3, 3, 8, 10, NULL, 90),
  ('Lat Pulldown', 4, 3, 10, 12, NULL, 90),
  ('Dumbbell Biceps Curl', 5, 2, 10, 12, NULL, 60),
  ('Triceps Pushdown', 6, 2, 10, 12, NULL, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Upper A'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Upper/Lower 4×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Barbell Back Squat', 1, 4, 6, 8, NULL, 150),
  ('Romanian Deadlift', 2, 3, 8, 10, NULL, 120),
  ('Leg Press', 3, 3, 10, 12, NULL, 90),
  ('Leg Curl', 4, 3, 10, 12, NULL, 60),
  ('Standing Calf Raise', 5, 3, 12, 15, NULL, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Lower A'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Upper/Lower 4×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Incline Dumbbell Press', 1, 3, 8, 12, NULL, 90),
  ('One-Arm Dumbbell Row', 2, 3, 8, 12, NULL, 90),
  ('Dumbbell Lateral Raise', 3, 3, 12, 15, NULL, 60),
  ('Chin-Up', 4, 3, 6, 10, NULL, 90),
  ('Face Pull', 5, 3, 12, 15, NULL, 60),
  ('Hammer Curl', 6, 2, 10, 12, NULL, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Upper B'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Upper/Lower 4×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Trap Bar Deadlift', 1, 4, 5, 6, NULL, 150),
  ('Bulgarian Split Squat', 2, 3, 8, 10, NULL, 90),
  ('Hip Thrust', 3, 3, 8, 12, NULL, 90),
  ('Leg Extension', 4, 2, 12, 15, NULL, 60),
  ('Hanging Knee Raise', 5, 3, 10, 12, NULL, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Lower B'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Upper/Lower 4×/week';

-- Push/Pull/Legs 6×/week
WITH p AS (INSERT INTO programs (workspace_id, name, description, goal, duration_weeks, days_per_week, is_template, sort_order) VALUES (NULL, 'Push/Pull/Legs 6×/week', 'Six sessions a week rotating push, pull and legs twice, with a different exercise selection on the second pass. Suited to experienced clients with time to train most days.', 'build_muscle', 8, 6, true, 4) RETURNING id)
INSERT INTO program_workouts (workspace_id, program_id, name, day_number, position, notes) SELECT NULL, p.id, w.name, w.day_number, w.position, w.notes FROM p, (VALUES
  ('Push A', 1, 1, NULL),
  ('Pull A', 2, 2, NULL),
  ('Legs A', 3, 3, NULL),
  ('Push B', 4, 4, NULL),
  ('Pull B', 5, 5, NULL),
  ('Legs B', 6, 6, NULL)
) AS w(name, day_number, position, notes);
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Barbell Bench Press', 1, 4, 6, 8, NULL, 120),
  ('Overhead Press', 2, 3, 6, 8, NULL, 120),
  ('Incline Dumbbell Press', 3, 3, 8, 12, NULL, 90),
  ('Dumbbell Lateral Raise', 4, 3, 12, 15, NULL, 60),
  ('Triceps Pushdown', 5, 3, 10, 12, NULL, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Push A'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Push/Pull/Legs 6×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Pull-Up', 1, 4, 6, 8, NULL, 120),
  ('Bent-Over Barbell Row', 2, 3, 6, 8, NULL, 120),
  ('Seated Cable Row', 3, 3, 10, 12, NULL, 90),
  ('Face Pull', 4, 3, 12, 15, NULL, 60),
  ('Barbell Curl', 5, 3, 8, 12, NULL, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Pull A'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Push/Pull/Legs 6×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Barbell Back Squat', 1, 4, 6, 8, NULL, 150),
  ('Romanian Deadlift', 2, 3, 8, 10, NULL, 120),
  ('Walking Lunge', 3, 3, 10, 10, NULL, 90),
  ('Leg Curl', 4, 3, 10, 12, NULL, 60),
  ('Standing Calf Raise', 5, 4, 12, 15, NULL, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Legs A'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Push/Pull/Legs 6×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Dumbbell Bench Press', 1, 4, 8, 10, NULL, 90),
  ('Seated Dumbbell Shoulder Press', 2, 3, 8, 10, NULL, 90),
  ('Cable Chest Fly', 3, 3, 12, 15, NULL, 60),
  ('Cable Lateral Raise', 4, 3, 12, 15, NULL, 60),
  ('Overhead Dumbbell Triceps Extension', 5, 3, 10, 12, NULL, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Push B'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Push/Pull/Legs 6×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Lat Pulldown', 1, 4, 8, 10, NULL, 90),
  ('Chest-Supported Dumbbell Row', 2, 3, 8, 12, NULL, 90),
  ('One-Arm Dumbbell Row', 3, 3, 10, 12, NULL, 60),
  ('Rear Delt Fly', 4, 3, 12, 15, NULL, 60),
  ('Hammer Curl', 5, 3, 10, 12, NULL, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Pull B'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Push/Pull/Legs 6×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Front Squat', 1, 4, 6, 8, NULL, 150),
  ('Hip Thrust', 2, 3, 8, 12, NULL, 90),
  ('Bulgarian Split Squat', 3, 3, 8, 10, NULL, 90),
  ('Leg Extension', 4, 3, 12, 15, NULL, 60),
  ('Seated Calf Raise', 5, 4, 12, 15, NULL, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Legs B'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Push/Pull/Legs 6×/week';

-- Home Dumbbell 3×/week
WITH p AS (INSERT INTO programs (workspace_id, name, description, goal, duration_weeks, days_per_week, is_template, sort_order) VALUES (NULL, 'Home Dumbbell 3×/week', 'Three full-body sessions a week using only a pair of dumbbells, a bench or sturdy chair, and bodyweight. For clients training at home.', 'improve_fitness', 8, 3, true, 5) RETURNING id)
INSERT INTO program_workouts (workspace_id, program_id, name, day_number, position, notes) SELECT NULL, p.id, w.name, w.day_number, w.position, w.notes FROM p, (VALUES
  ('Home A', 1, 1, NULL),
  ('Home B', 3, 2, NULL),
  ('Home C', 5, 3, NULL)
) AS w(name, day_number, position, notes);
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Goblet Squat', 1, 3, 10, 12, NULL, 75),
  ('Dumbbell Bench Press', 2, 3, 8, 12, NULL, 75),
  ('One-Arm Dumbbell Row', 3, 3, 10, 12, NULL, 60),
  ('Dumbbell Romanian Deadlift', 4, 3, 10, 12, NULL, 75),
  ('Plank', 5, 3, NULL, NULL, 30, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Home A'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Home Dumbbell 3×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Dumbbell Reverse Lunge', 1, 3, 8, 10, NULL, 75),
  ('Seated Dumbbell Shoulder Press', 2, 3, 8, 12, NULL, 60),
  ('Chest-Supported Dumbbell Row', 3, 3, 10, 12, NULL, 60),
  ('Glute Bridge', 4, 3, 12, 15, NULL, 60),
  ('Dead Bug', 5, 3, 10, 10, NULL, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Home B'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Home Dumbbell 3×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Bulgarian Split Squat', 1, 3, 8, 10, NULL, 75),
  ('Push-Up', 2, 3, 8, 12, NULL, 60),
  ('Rear Delt Fly', 3, 3, 12, 15, NULL, 45),
  ('Hammer Curl', 4, 2, 10, 12, NULL, 45),
  ('Overhead Dumbbell Triceps Extension', 5, 2, 10, 12, NULL, 45),
  ('Farmer''s Carry', 6, 3, NULL, NULL, 40, 60)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Home C'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Home Dumbbell 3×/week';

-- Mobility & Recovery 2×/week
WITH p AS (INSERT INTO programs (workspace_id, name, description, goal, duration_weeks, days_per_week, is_template, sort_order) VALUES (NULL, 'Mobility & Recovery 2×/week', 'Two gentle sessions a week of mobility drills and stretches, for rest days or as a complement to strength training. Work in a comfortable, pain-free range.', 'improve_fitness', 4, 2, true, 6) RETURNING id)
INSERT INTO program_workouts (workspace_id, program_id, name, day_number, position, notes) SELECT NULL, p.id, w.name, w.day_number, w.position, w.notes FROM p, (VALUES
  ('Mobility A: Hips & Spine', 2, 1, 'Breathe slowly; no bouncing.'),
  ('Mobility B: Shoulders & Legs', 5, 2, NULL)
) AS w(name, day_number, position, notes);
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Cat-Cow', 1, 2, 10, 10, NULL, 15),
  ('World''s Greatest Stretch', 2, 2, 5, 5, NULL, 15),
  ('Hip Flexor Stretch', 3, 2, NULL, NULL, 40, 15),
  ('Figure-Four Stretch', 4, 2, NULL, NULL, 40, 15),
  ('Child''s Pose', 5, 2, NULL, NULL, 45, 15)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Mobility A: Hips & Spine'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Mobility & Recovery 2×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Thoracic Rotation', 1, 2, 8, 8, NULL, 15),
  ('Doorway Chest Stretch', 2, 2, NULL, NULL, 30, 15),
  ('Band Pull-Apart', 3, 2, 15, 15, NULL, 30),
  ('Hamstring Stretch', 4, 2, NULL, NULL, 40, 15),
  ('Ankle Mobility Drill', 5, 2, 10, 10, NULL, 15),
  ('Foam Roll: Quads', 6, 1, NULL, NULL, 90, 0)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Mobility B: Shoulders & Legs'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Mobility & Recovery 2×/week';

-- Online Coaching Starter 3×/week
WITH p AS (INSERT INTO programs (workspace_id, name, description, goal, duration_weeks, days_per_week, is_template, sort_order) VALUES (NULL, 'Online Coaching Starter 3×/week', 'Three short sessions a week a client can follow on their own with bodyweight and a resistance band, with clear cues for remote coaching. Review form videos or check-ins as you prefer.', 'improve_fitness', 6, 3, true, 7) RETURNING id)
INSERT INTO program_workouts (workspace_id, program_id, name, day_number, position, notes) SELECT NULL, p.id, w.name, w.day_number, w.position, w.notes FROM p, (VALUES
  ('Session 1', 1, 1, 'Warm up with 3 minutes of marching in place.'),
  ('Session 2', 3, 2, NULL),
  ('Session 3', 5, 3, NULL)
) AS w(name, day_number, position, notes);
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Bodyweight Squat', 1, 3, 12, 15, NULL, 60),
  ('Incline Push-Up', 2, 3, 8, 12, NULL, 60),
  ('Band Row', 3, 3, 12, 15, NULL, 60),
  ('Glute Bridge', 4, 3, 12, 15, NULL, 45),
  ('Plank', 5, 3, NULL, NULL, 30, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Session 1'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Online Coaching Starter 3×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Reverse Lunge', 1, 3, 8, 10, NULL, 60),
  ('Band Shoulder Press', 2, 3, 10, 12, NULL, 60),
  ('Band Pull-Apart', 3, 3, 15, 15, NULL, 45),
  ('Lateral Band Walk', 4, 3, 12, 12, NULL, 45),
  ('Dead Bug', 5, 3, 10, 10, NULL, 45)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Session 2'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Online Coaching Starter 3×/week';
INSERT INTO program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
SELECT NULL, w.id, e.id, x.position, x.sets, x.reps_min::smallint, x.reps_max::smallint, x.duration_seconds::int, x.rest_seconds::smallint
FROM (VALUES
  ('Split Squat', 1, 3, 8, 10, NULL, 60),
  ('Push-Up', 2, 3, 6, 10, NULL, 60),
  ('Band Lat Pulldown', 3, 3, 12, 15, NULL, 45),
  ('Bird Dog', 4, 3, 8, 10, NULL, 45),
  ('Step Jack', 5, 3, NULL, NULL, 40, 30)
) AS x(exercise, position, sets, reps_min, reps_max, duration_seconds, rest_seconds)
JOIN exercises e ON e.workspace_id IS NULL AND e.name = x.exercise
JOIN program_workouts w ON w.workspace_id IS NULL AND w.name = 'Session 3'
JOIN programs p ON p.id = w.program_id AND p.workspace_id IS NULL AND p.name = 'Online Coaching Starter 3×/week';
