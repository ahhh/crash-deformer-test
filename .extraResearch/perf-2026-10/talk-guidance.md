# Talk guidance extracts

## Talk 1: ArcadeDriftPhysics (Parking Garage Rally Circuit; talk runs 00:00-25:10)

### Design goals
1. [00:15] Game should feel accessible and easy to control like Mario Kart, with one button to drift.
2. [00:19] Unlimited boost chaining.
3. [00:24] A "right-on-the-edge-of-control" feeling like Crazy Taxi.
4. [00:28] Approach: combine the Mario Kart and Crazy Taxi feels.

### Who is in charge: car or camera
5. [00:35] Core question (possibly incorrect epiphany about Mario Kart): who's in charge, the car or the camera?
6. [01:27] In Driver: a car simulation takes your inputs and the car has no idea a camera exists; a separate camera follows the car and frames the action.
7. [01:07] In Driver you let go of the steering input early (answer "1, 2, or 3" seconds), based on looking at the car, its pointing, traction, acceleration, slip, surface.
8. [01:55] In Mario Kart you generally let go of the steering input when the camera is pointed in the direction you want to be going.
9. [02:06] Hypothesis: in Mario Kart you steer the camera and the kart is a layer on top giving you other input about what you're doing.
10. [02:20] Driver: you stare at the car and occasionally glance at the road. Mario Kart: you look at the road and occasionally glance at the kart.
11. [02:33] Approach taken: the camera is in charge; you steer the camera through the world; the car is a layer on top.

### Camera-first build-up (point + raycast)
12. [02:46] Start with a point in space; raycast down, find ground, place itself a certain height above the ground.
13. [03:00] Add simple code: left/right inputs rotate the point.
14. [03:07] Forward/back inputs translate the point along its forward (blue, Z) direction.
15. [03:20] Place the camera on the point; back it up a little and attach it to the point for third-person view.
16. [04:12] Put a temporary car model on the point, change nothing else: it already looks like driving the car.
17. [04:22] Mario Kart hypothesis: whenever you turn left/right, simply rotate the car model on the point. "It's not a simulation or anything."
18. [04:54] Hide frame and debug things; steer the front tires the same way the car is turned.
19. [05:10] Limitation: going down a ramp breaks the illusion because it's a single point sliding through the world; more work needed to look like real Mario Kart.
20. [05:49] Result: you fly the camera through the world; the kart is a layer on top.

### Hovercraft physics body
21. [05:59] Next, connect the car to the world: a simple hovercraft.
22. [06:04] Cube with four raycasts, one per corner, shooting down and finding the ground.
23. [06:11] If a ray hits the ground, it pushes back on the cube to make it float a certain height above the ground.
24. [06:26] No friction concept: the hovercraft slides and skates around the world.
25. [06:35] It collides with and bounces off walls.
26. [06:42] Four raycasts each apply a force in the up direction.
27. [06:47] Strength of the force is based on how close that point is to the ground.
28. [06:53] Needs "get point velocity": velocity of a point on a rigid body, not of the whole body (a moving and rotating body has points moving in different directions). Godot doesn't have this built in.
29. [07:21] Camera places itself at the center point of the hovercraft; the hovercraft provides position only, nothing else, for the camera system.
30. [07:53] Hovercraft naturally orients to the terrain going down a hill.
31. [07:59] It is a physics object: smacking into other physics objects gives interactions for free.

### Acceleration and traction forces
32. [08:10] Accelerate: apply a force pushing the hovercraft in the direction it's pointed (camera direction).
33. [08:24] Problem: after steering, the hovercraft keeps sliding because of momentum from the old push in a different direction.
34. [08:59] Break velocity into two pieces: forward component (blue direction) and sideways component (red direction).
35. [09:20] Wish: all velocity only in the blue direction, none in the red.
36. [09:38] Forward/back drive code operates in the blue direction; add a force opposite the red component to stop sideways sliding.
37. [10:03] Acceleration force: input for forward/back becomes a desired speed (can be complicated by game design).
38. [10:12] Current forward speed = dot product of hovercraft velocity with the forward direction (the camera-facing direction).
39. [10:24] Compute acceleration to go from current forward speed to desired speed in one physics step.
40. [10:35] Force = acceleration times mass.
41. [10:42] That force would be super strong (car instantly jumps to desired speed), so put limitations on the force, then apply it.
42. [10:55] It is a central force: pushes the hovercraft, causes no spin.
43. [11:02] Traction force: sliding speed = dot product of actual velocity with the sideways axis.
44. [11:16] Compute acceleration to go from current sideways speed to desired sideways speed (zero) in one physics time step; force = mass times acceleration.
45. [11:37] Limit the traction force. If unlimited you'd have perfect traction and the car would never slide at all.
46. [11:52] Result: push forward/back freely; when turning, sideways velocity appears and is immediately destroyed by the traction force ("the car doesn't want to slide sideways").
47. [12:30] The car itself has no concept of traction; it is spinning through the world; hitting a wall makes it rotate.
48. [12:46] All forces applied to the hovercraft come from the camera: accelerate pushes in camera facing direction; constant force resists sliding sideways.

### Posing the car (torque)
49. [13:02] Want the Mario Kart look: the car is posed and always points forward.
50. [13:11] Work out the signed angle between the camera facing direction (dark blue) and hovercraft facing direction (light blue): zero, negative or positive.
51. [13:26] Use that angle to apply a torque rather than a push force, rotating the hovercraft to point where the camera faces.
52. [13:43] Torque is a big positive number on one side, ~zero when aligned, negative on the other: "almost like a spring".
53. [14:04] Torque in code: which way hovercraft points, which way camera points, signed angle between them.
54. [14:14] Spring on the angle: offset times spring power; positive turns one way, negative the other.
55. [14:31] Implemented as a damped spring: also subtract a portion of angular velocity (about the axis the torque is applied around).
56. [14:52] It's a spring force applied as a torque instead of a force.
57. [15:00] There's a little lag because it's a torque.
58. [15:33] Mario Kart step: the same torque points the car where you want; offset the target a little: when turning left, turn the car a little more to the left; same for right.
59. [16:11] Parking Garage Rally Circuit summary: you drive a camera through the world, the car is a hovercraft, and the car is posed relative to the camera to point a little in a plausible way and give feedback about what you're doing with the controls.

### Drifting
60. [16:47] Drifting is just two things.
61. [16:52] Thing 1: when you go into drift mode the car steers automatically; you can let go of the steering input and the car steers on its own.
62. [17:04] Thing 2: the direction the car wishes it was going is not the camera direction but offset a little.
63. [17:16] Drifting = automatically steering and sliding at the same time.
64. [17:33] Final step: steering input affects the offset angle you want to drive at (steer into the drift, counter the drift).
65. [17:50] Come around a corner, start a drift, adjust it, let go and drive straight again.
66. [18:14] Exaggerate the car pose: when you steer it's a little, when you drift it's a lot.
67. [18:19] Also tilt the 3D car model for an extra lean in the direction of the drift.
68. [18:29] Camera tilts and changes field of view to accentuate the effect.

### Boost system
69. [18:41] Speed graph: drive at normal top speed; green line lines up with the normal top-speed line.
70. [18:51] When you drift, speed drops.
71. [18:56] After the drift, if it's a clean drift, you get a boost.
72. [18:59] Boost lasts a little while, then top speed drops back to normal top speed.
73. [19:11] Boosts can be chained.
74. [19:15] Chain rule: if you start a drift while boosting, the boost that comes after it is stacked on top.
75. [19:37] Top speed ends up significantly above normal even while drifting.
76. [19:43] Stacking can reach about twice the normal top speed, maybe 3x with enough chaining on a track.
77. [19:57] Risk/reward comes from this; tight drifting controls give a feeling of control; physics-based hovercraft car plus boost chaining give the feeling of barely being in control and weaving through traffic.
78. [20:21] A little assist: colliding with cars didn't totally kill speed; the game is generous.

### Crashing (stated downside)
79. [20:33] Downside: what to do about crashing. No car simulation; a hovercraft puppeteered by forces and torques.
80. [20:46] Actual collider of the car floats above the ground.
81. [20:53] Debug states shown: driving, drifting, boosting, etc.
82. [21:03] Problem: constantly pointing the car where you want it to go; if you smack into something and the car is yanked to point forward, it looks weird; unclear how to stop puppeteering.
83. [21:20] Author calls this the weakest point of the game.
84. [21:26] Two criteria to decide you crashed (stop posing the car): (a) you hit something hard enough, or (b) the angle between which way you're headed and which way the car is facing is too big. Then go into the crashed state.
85. [21:47] Crashed state flips the logic: stop posing the car, let the car fly around with physics doing whatever it wants, and try to get the camera back around behind the car.
86. [22:03] Stay in crashed state until the camera is mostly back behind the car again; then turn posing back on.
87. [22:12] Binary decision: am I in control / puppeteering / crashing? Two state changes: entering the crash state and leaving it.
88. [22:30] If you smack into something it can flicker into the crash state.
89. [22:52] Must decide when to let go of the car (enter crash) and when things have settled enough to go back to puppeteering.
90. [22:59] Most complaints that the physics do weird things are about this topic: entering crash when it shouldn't, or exiting too soon so physics picks up and causes strange reactions.
91. [23:24] Author agrees he could have tuned the system and its thresholds better.
92. [23:34] Every design decision makes some things easy (drifting, boosting, steering come naturally from camera-first) and others hard (crashing); you have to deal with those trade-offs every time.

### Closing
93. [23:57] Author doesn't like follow-along step-by-step tutorials: hard to retain information; this video is a high-level breakdown.
94. [24:23] Things to look up: how to do a spring force, how to apply torques, what the dot product is.
95. [24:39] Promotion: DLC "European Tour", eight new tracks in Western Europe, about five bucks on Steam. (end 25:10)

## Talk 2: Vehicle Feel Masterclass: Arcade Feel With Simulation Depth (Matthew Harris, Criterion Games; talk runs 00:06-57:33)

### Talk intro (Matthew Harris, Criterion Games, "Vehicle Feel Masterclass: Balancing Arcade Accessibility with Simulation Depth")
1. [00:26] Talk isn't a set of hard and fast rules; it is a sharing of processes and guidelines followed during development.
2. [00:44] Talk is focused on the handling side of game feel only (audio, VFX, sense of speed, force feedback excluded).
3. [01:20] Criterion encourages cross-discipline skills; the programmer works closely with designers to tune and design vehicle handling.
4. [02:05] Structure: physicality-first approach to simulation -> add accessibility through an input-layer of assists (critical to accessibility without reducing depth) -> feed the handling back via the camera.

### Arcade vs simulation
5. [02:58] "Arcade" here means a particular set of game design decisions leading to an arcade feel, not a genre like top-down shooters.
6. [03:06] Arcadey games: intuitive controls readily apparent to the player; compromise on realism for the sake of fun; a multitude of game mechanics the player balances against each other.
7. [03:20] Simulation games: replicate a real-world experience; control system is immersiveness first; high degree of realism and believability from gameplay and handling.
8. [03:31] Simulation games have fewer game mechanics than arcade games; gameplay is focused on controlling a realistic vehicle, not weapons and boost.
9. [03:40] Design decisions give a sliding scale between arcade and simulation.
10. [03:49] Simulation end (Forza Horizon, Forza, iRacing): gameplay entirely around racing lines, cornering, drafting; most assists off by default but optional accessibility options (braking, steering help); high learning curve but very rewarding for players who master it.
11. [04:19] Simcade (middle; hybrid games such as Forza Horizon and Need for Speed Live): Hollywood realism, over the top but within the realms of real life; exaggerated drifts, massive jumps; additional challenges (extreme weather, weapons, cop chases).
12. [04:50] Arcade-style races: heavily stylized or cartoonish tone; large variety of game mechanics (drifting, boosting, stunts, weapons) learned in addition to racing; racing gameplay is quite accessible for new players but still has depth for players who want the most out of the game.
13. [05:17] Simulation races have fewer mechanics for the player to focus on; aim is to make cornering and racing as satisfying as possible.
14. [05:32] Arcade is generally more accessible and fun; simulation is harder to get into but offers a more serious take on racing competition.
15. [05:41] Key consistency: the player has to input controls at a satisfying cadence; actions per minute are actually pretty comparable between simulation and arcade.
16. [05:50] Simulation: the player focuses all attention on the racing line, tapping, braking and turning at just the right intervals to nail the corner.
17. [05:57] Arcade: the player divides attention between drifting around corners, boosting and firing weapons; arcade-style races have a wider variety of game challenges to focus on than simulation.
18. [06:17] Factors to decide where on the scale to be: (a) what sort of players are you targeting (serious sports fans demanding realism, or fantasy fulfillment)? (b) how serious and realistic is your game tone?
19. [06:31] If you plan lots of mechanics such as boosts and weapons you'll likely fall more on the arcade side.
20. [06:39] Balance the number of mechanics and complexity of the simulation against your assists, to achieve a sensible rate of actions per minute.
21. [06:46] How much effort do you want to spend on your physical simulation? If you can't put much time in but are building a realistic motorsport simulator you might end up with boring and shallow gameplay.
22. [06:57] Do you want the game accessible to lots of players or focused on an experienced target market?
23. [07:02] If building an arcade or simcade racer you'll likely need some assists to help keep input frequency at satisfying levels.
24. [07:09] These aren't hard and fast rules, but you should have a strong idea of where you want to sit on this spectrum.
25. [07:14] Don't try and have it all, otherwise you risk building an overly demanding and complex game.
26. [07:20] Criterion's approach: combine the best of both worlds; start with physicality and build a realistic, physically-based simulation; then build assists on top, which makes the simulation more accessible and lets the player focus on more things at once.
27. [07:35] Designers carefully balance physicality and accessibility to get a balanced experience: easy to learn but hard to master. Used since Need for Speed Hot Pursuit.

### Physical simulation
28. [07:54] Physical simulation is the foundation that allows building a game with deep mastery and rewarding challenge.
29. [08:11] The context of your game affects which elements to simulate; compare simulations of car dynamics using approaches that mimic real-world physical effects.
30. [08:20] Ideally pick parts of the simulation that add play to the handling, giving the player multiple things to balance and learn to achieve their goal.
31. [08:34] Before starting physical simulation, consider game context = a set of requirements on your simulation.
32. [08:40] Consider: is your environment wide open or enclosed? How does this affect desired vehicle behavior? What is the player's goal (racing, stunts, getting from A to B)? If A to B is a challenge, the game may be about complex traversal.
33. [09:01] Forza Motorsport: wide road, long curved turns; player wants to win through precision driving through corners and drafting.
34. [09:15] Burnout: urban roads, tight turns, some jumps; player could be racing or doing stunts for a score-attack mode; focus on cornering but also boosting and stunts.
35. [09:32] Destiny's Sparrow: transport vehicle designed for open terrain but piloted down narrow corridors; main intention is to reach the target without colliding and slowing down too much; lower pressure.
36. [09:49] Uncharted Jeep: light puzzle mechanics navigating up rookie mud slides; challenge is picking a route up the mudslide while keeping the tires in a state of grip.
37. [10:01] Each context has its own requirements from the vehicle. If you change the context, re-evaluate the vehicle and see if it still suits it.
38. [10:09] Example: Sparrow racing in Destiny worked as a timed special event but if they wanted to build more of the game around racing they would retune the vehicle to fit that context.
39. [10:26] During production it's easy to forget to update a vehicle if the context shifts, particularly if the vehicle has shipped before (speeder bike BF1 reworked entirely for BF2 because of new map topography plus tech debt).
40. [10:47] Vehicle and environment are complementary; changing one may require changing the other.
41. [10:53] Motorsport racing as context: somewhere on the SimK (Simcade) part of the spectrum; an expectation of realism, so simulation should be based off real physical effects and let the player play with grip and acceleration.
42. [11:13] Needs enough depth that each vehicle accelerates and turns differently; the simulation needs to be detailed enough to support that accurately.
43. [11:22] Benefit: with a realistic physical simulation, real-world tuning data (engine or tire metrics) can be used as a starting point for tuning vehicles.
44. [11:33] Trivially simple model: frictionless rigid body with a single force and torque applied at the centre of mass: result is flat, unrealistic motion that is not enjoyable or interesting to drive. Very few gains would be served by this model.
45. [11:53] Take inspiration from real-world vehicles to improve: look at real-world systems for motorsport vehicles (powertrain and tire friction as examples).

#### Powertrain
46. [12:39] Engine and transmission are the powertrain system: purpose is to transmit energy from the engine to the wheels (engine -> clutch -> transmission -> differential -> wheels).
47. [13:06] Powertrain is a feedback loop: the engine provides torque to the wheels but the wheels resist movement (not just wheel inertia but because the wheel is in contact with the ground and must overcome the inertia of the whole vehicle before rotating at optimal speed).
48. [13:29] Some of the energy is used to overcome inertia, affecting the amount of energy actually used to drive the vehicle forward.
49. [13:37] When modelling, look into each piece: engine simulation may need authorable torque at different operating RPM plus engine inertia and the feedback mechanism; clutch may want different operating efficiencies at different RPM; transmission could simulate numerous gear setups and how long it takes to change between them; tires apply force realistically via tire friction.
50. [14:14] Compare simple model with powertrain model on a speed-over-time graph: simple model has very uniform acceleration profile; complex model has a more curved profile: more acceleration at the beginning of takeoff than nearing top speed, with small bumps at the gear changes.
51. [14:38] Because of transmission simulation, multiple gears are more effective at providing acceleration at the lower end of their working speed range and then tail off as vehicle speed approaches the next gear's working range.
52. [14:49] Even just driving in a straight line, the simulation has added much more complexity and interesting physicality than the simple model.

#### Tire friction
53. [15:04] Wheel hub with rubber tire; the section at the bottom is slightly flattened under load of the vehicle and is called the contact patch.
54. [15:18] A point on the hub vs. the corresponding point where the tire touches the ground: as the hub rotates the tread and wall stretch between them; the elastic force of the rubber tries to spring back, pulling the contact point back and applying an equal force onto the wheel hub, pushing the whole vehicle forward slightly; continues until vehicle speed matches the rotational velocity of the tire.
55. [15:55] Need a simulation model for how much force is applied under what conditions: dynamics are incredibly complex, many models; Pacheco model used (formula takes the rotation speed of the wheel and relative velocity of the road).
56. [16:13] Slip angle = angle between the direction of the ground velocity and the direction of the wheel hub.
57. [16:18] Pacheco formula produces two forces: longitudinal force (drives the vehicle forward) and lateral force (turns the vehicle).
58. [16:26] During acceleration the road speed is lower than the wheel speed, so longitudinal slip maps to a particular force in the graph: right-hand side = accelerating, left-hand side = braking.
59. [16:39] Lateral force graph: under a particular slip angle gives the turning force during cornering.
60. [16:46] Each graph has a peak, which is where the most effective acceleration or cornering behavior is found; this gives the effect of playing with the limits of grip.
61. [16:56] The player has to try and hit these peaks to be as effective as possible during a race; this adds a lot of depth and mastery.
62. [17:09] Visible results: chassis rocks back and forth during gear changes due to drivetrain simulation; body rolls to the side during corners due to tire friction and suspension simulation. Depth of simulation shows through and gives the player precise control and physical play to master.

### Input and assists
63. [17:52] With accurate, deep simulation of the desired vehicle sorted, look at input and assists to give the feel and balance between arcade and simulation aimed for.
64. [18:01] Drifting definition: forcing the rear wheels of a tyre to break traction so the vehicle drifts sideways to maintain momentum in a turn; possible but tricky to achieve in real life, so Criterion applies several assists to help players achieve a long, satisfying drift.
65. [18:22] Input layer: control mapping and any modifications to control inputs, sent across to the simulation where it turns the wheels or drives the engine.
66. [18:35] Key point: you have assists that might work on either side (input layer or simulation). Example: input layer assist detects a button combo to trigger drift mode; simulation level assist applies increased physical damping while in drift mode.
67. [18:53] Decide what you want to achieve by adding assists. Once the input layer communicates with the simulation you have something playable; review and see what needs to change.
68. [19:03] Reasons for assists: input complexity too high (reduce it); reduce the simulation feel and move toward the arcade side; take existing forces or effects in the simulation and emphasize them (e.g. making drifts last longer).
69. [19:19] Detailed simulation can bring unwanted side effects such as extreme slowdown on uneven terrain or collision hitching; assists may target these.
70. [19:29] Assists can convey the game state back to the player in a more intuitive/obvious manner so that the learning curve is easier.
71. [19:37] Assists can also be accessibility options to make the game playable by a wider range of players.

#### Five assist categories
72. [19:52] Five categories: player intention, driver, physical, real world, feedback. Not hard templates; a thought exercise for deciding which parts of the game to target.
73. [20:07] Need for Speed drifting: took a simulation with realistic drifting behaviour and used multiple types of assists to make it more stable, easier to sustain, and maintain more of your speed than in real life.
74. [20:27] Player intention assist: at the input level, looks at the player's input and works out whether their intention differs from the normal mapping; can look at the current simulation for context.
75. [20:41] Example: brake tap to enter drift. Driving straight ahead and tap brake = want to slow down. Turning heavily when you tap brake = want to enter drift to turn more aggressively.
76. [20:56] Driver assist: simulates the experience and muscle memory of a professional driver.
77. [21:02] Example: balancing your torque. In real drifting the tires twist to match the drift direction and the driver feels it through the steering wheel and adjusts to extend the drift. Analog stick doesn't lend itself to this, so emulate it by re-centering steering input so that zero input = keep drifting at this angle rather than straighten the wheels.
78. [21:27] This is absolutely key for a controllable drift and gives the player the control an ace driver could achieve.
79. [21:34] Physical assists: forces applied directly to the vehicle's physics simulation; take existing qualities of the simulation you want to feel hyper-real and emphasize what's there; look at the forces applied by the simulation that hinder the desired effect and counteract them.
80. [21:50] Example: in a deep drift a component of the tire friction opposes motion and slows the vehicle. Calculate the magnitude of the frictional force slowing you down and reapply that force in the direction of the vehicle's velocity to minimize speed loss; lets designers tune how much speed loss they desire.
81. [22:10] Real-world assists: simulate part of the vehicle which exists in real life and manipulate it to achieve the desired effect. Example: ABS lets players brake effectively without carefully tapping triggers; when drifting starts, turn ABS off so back wheels spin and lose traction (enter the drift quickly); when the player is detected trying to exit the drift, turn ABS back on to allow fast acceleration out.
82. [22:40] Feedback assists: do not affect handling; help the player understand the simulation and show UI. Wherever possible feed back the simulation from real-world sources (strain of the engine, squeal of tires); feedback assists are specifically things you wouldn't see in real life. Example: Forza braking line highlights red if tires will lose traction and you should slow down.

#### Tips for assists
83. [23:07] Since assists influence both controls and the physical simulation, getting their feel right is just as important as tuning the physical simulation; wrongly tuned they can disguise all the great simulation work.
84. [23:19] Tip: tune assists to be as subtle as possible while still achieving the desired effect; it's easy to have very strong stabilization forces which help effectively but wipe over your simulation work.
85. [23:34] Tip: rather than switching behaviour on/off on a binary condition, fade it in or out over some parameter, even if that parameter is time; less obvious to the player and adds nuance.
86. [23:47] Tip: think about where the optimal assist strength is and let the player gradually learn to find the perfect balance (depth and mastery); the game should feed this back to the player so they can tell if they're doing better.
87. [23:59] Tip (programmers): add plenty of helpful debug visualizations so designers can see what physical effect their parameter changes have.
88. [24:13] Tip: set up auto tests for vehicles and their expected top speeds, accelerations etc. to catch unexpected changes or a physical assist affecting vehicle performance. (Most Wanted: a vehicle artist adjusted a wheel's size and it changed the top speed; caught by an auto test and fixed quickly.)

### Camera
89. [24:50] "Camera is handling" (phrase used a lot at Criterion): it doesn't matter how great the simulation and assists are if the camera doesn't feed it back well.
90. [24:59] A stiff or loose camera can massively change the feel of a vehicle, so it is part of the handling; the same designers who tune handling parameters tune the camera parameters because they're intrinsically linked.
91. [25:13] Two approaches: camera-led (player input turns the camera and a layer interprets camera direction and passes it to vehicle controls) vs vehicle-led (player input controls the vehicle directly and the camera follows as a separate system).
92. [25:36] Camera-led usually matches the shooter paradigm (aim/pitch on the right stick); lets the player point the camera accurately but at the loss of handling feel and precision; good where primary gameplay is aiming and shooting and driving is secondary (e.g. Mark V tank in Battlefield 1).
93. [26:04] Camera-led layer decides how to move the tank tracks to point at the camera rather than direct control; adds ambiguity and unexpected motion, particularly when reversing a vehicle with camera-led handling.
94. [26:23] Vehicle-led is usually the default for racing games; steering on left stick and camera follows the vehicle's motion; more direct control feel, greater driving precision and camera feedback but harder to quickly look behind (so usually accompanied by a look-behind button).
95. [26:45] BF1 armored car used a vehicle-led camera for best game feel. "At Criterion, we almost always use vehicle-led cameras due to the precise handling feel we require."
96. [27:07] A good camera should: feed back important game state (e.g. camera angle while drifting); respond to player needs (focused on what the player needs to see, doesn't obstruct line of sight); sell physicality by using the physical simulation to complement the vehicle motion.
97. [27:27] Rigid camera (locked behind the vehicle, pointing directly down the front; no behaviour): the simplest starting point; vehicle position locked on screen so physicality shows through the background rolling and pitching, which can be disorientating and makes it hard to focus on game objectives.
98. [27:58] Improve by conveying vehicle motion by moving it in relation to the frame of the screen: in a deep right turn the camera lags slightly and the vehicle shifts to the left of the screen.
99. [28:10] Sprung camera: set a target point for the camera to tend towards, allow motion in all directions with a force pulling the camera toward the target proportional to how far away it is.
100. [28:23] Tune the spring per axis (e.g. lots of sideways motion when turning, less forward/back motion when accelerating/decelerating).
101. [28:34] Also point the camera at a look-ahead target fixed in front of the vehicle which shows the player where the vehicle is heading.
102. [28:43] Consider velocity extrapolation on the look-ahead target so the camera looks into turns and keeps the player's focus near the center of the screen when turning.
103. [28:57] In all the demo videos the physical simulation and handling are identical; only the camera changes.
104. [29:27] Three key sprung-camera tuning parameters: convergence (most important; how far the camera moves toward the target each sim frame; higher = tighter to the back of the vehicle); momentum (accelerates the camera in the direction it's already travelling); damping (stops the camera overshooting the target and oscillating).
105. [29:53] Strong convergence: very similar to the rigid camera; vehicle isn't moving much on screen; doesn't feel very physical.
106. [30:11] Weak convergence: much more motion in frame; vehicle feels dynamic and alive; but the vehicle appears to point off screen during large turns, which is tricky to control as you can't see where you're going; fix by tightening the camera or adding velocity extrapolation to the look-ahead target.
107. [30:35] Landing camera: the camera must sell physicality; when the vehicle comes off a large jump and hits the ground so hard the suspension bottoms out, convey with a large camera movement that doesn't obscure the road ahead for long but still sells the impact; momentum and damping forces give an exaggerated behaviour when landing.
108. [31:04] The plain sprung camera already gives some feedback and could probably ship, but go the extra mile.
109. [31:18] Add camera shake on landing when all four wheels are on the ground after travelling downwards quickly: 30 Hz oscillation in pitch and roll for 0.5 seconds.
110. [31:39] Reduce the damping on the sprung camera so the momentum term carries it further downwards than the target, giving a better sense of impact.
111. [32:04] BF1 camera checks against the requirements: convergence affects the vehicle's position on screen so the player can tell the turning radius (feeds simulation back); looks into turns so player sees where they're going (responds to player needs); special attention to the landing camera makes the vehicle feel extra heavy and solid (sells physicality).

### Case study: Starfighters in Star Wars Battlefront 2
112. [33:27] Direction: players feel like an ace pilot; improve BF1 handling significantly; much larger scale game mode.
113. [33:54] BF1 shooting: hold left trigger to lock onto anything within a wide cone in the middle of the screen, right trigger to fire; shots auto-aimed as long as there's a lock-on. BF1 used a camera-led handling level (camera moves first, vehicle catches up).
114. [34:25] Player feedback on BF1: enjoyed the Star Wars fantasy; very accessible; but lacked depth around auto-aimed shooting, difficult to control, starfighters felt like toys on a string; players wanted manual roll control.
115. [34:48] BF2 fixes: aiming closer to a shooter; handling that felt precise; a camera that shows off the physicality of the vehicles; roll control.
116. [36:01] Arcade vs simulation balance: target market was casual gamers wanting accessibility plus hardcore players expecting a flight-sim-like pilot fantasy; decision: intuitive pitch and yaw controls like an arcade game, but give players full roll control, letting players execute their own evasive manoeuvres rather than cutscenes triggered on the D-pad (BF1).
117. [36:29] Shooter input paradigm (flight and aiming on the right stick) as more intuitive for players from a shooter background and matching the rest of the game; provide an option to fully remap the analog sticks for those expecting a flight-sim setup.
118. [36:47] Simulation analog: fighter planes. X-Wings bank into turns like planes; crashing Star Destroyers fall downwards.
119. [37:01] Airfoils (which keep planes in the air and give secondary effects like altitude loss when turning) were rejected as not matching expectations of a starfighter; went with a simple anti-grav simulation instead.
120. [37:15] Kept the banked turns from a fighter plane, simulated with a horizon steering setup: controls stay locked to the horizon but the starfighter banks on screen.
121. [37:26] Used a simple engine thrust force instead of a prop/jet engine model as no need for airflow play in space.
122. [37:36] Aerodynamic drag in a heavy turn affects how aggressively a plane can turn; did something similar with an air brake: experienced players pull the air brake when turning for a temporarily reduced turn radius. No physical justification but it felt right; prototyped and playtested until convinced it belonged in production.
123. [38:01] Horizon steering: two separate frames represent an orientation (matrix or quaternion). Control frame stays flat when the player yaws (points in the direction of flight following the ship's pitch) and allows the yaw of the ship to be expressed in the direction it appears on screen. Body frame rolls into the turn for banked turns; the camera stays flat so the player controls the direction intuitively.
124. [38:40] If the starfighter is pitched up, it rotates on the newly oriented horizon (pointing straight up and turning left/right ends up pointing downwards in the local pitch horizon rather than fading to the world horizon).
125. [38:55] Camera: camera-led was rejected (BF1 used it and it lacked the hoped-for precision); vehicle-led gives greater flight precision (an initial goal) and improved physicality; chose a vehicle-led sprung camera in a similar style to Battlefield 1.
126. [39:28] Vehicle-led camera looks into the direction of travel and allows the starfighter to move significantly but predictably on-screen.

### Camera shake and aim precision (BF2 starfighters)
127. [39:50] Problem: hard to aim while the camera is shaking (you aim down the camera).
128. [40:07] Conventional camera shake rotates the camera around its center point (pitch/roll by x degrees), so a distant focus point moves a lot on screen.
129. [40:16] Fix: orbit camera shake: shake the camera by moving it laterally as well as rotating it, keeping it pointed at a particular point far away towards the horizon; foreground things (the vehicle) move around on screen, distant targets stay stable.
130. [40:52] Blending the two shake types lets designers tune shake for near vs far objects; they chose distant aim stability due to the game's focus on shooting.

### Auto-roll
131. [41:06] Strong sense of up in levels: players ended up upside down frequently even without the roll control, so added auto-rolling that kicks in when the sticks are centered.
132. [41:18] Reasoning: return to center is a player intention to fly straight, so always accompanying it with rolling to the horizon isn't obtrusive; it is a smaller, more subtle force when almost level; as unobtrusive as possible.
133. [41:32] A small 20 degree window when the starfighter is inverted where auto-roll never kicks in, so players can fly upside down when they intend to; all other angles tend back to the horizon.
134. [41:44] Added a settings toggle to turn auto-roll off for hardcore players who want total control over orientation.

### Shooting assists
135. [41:56] Incredibly hard to hit a moving target by pointing your ship towards another.
136. [42:10] Numbers: max targeting range around 800 meters (ships small on screen); targets travel up to 120 meters per second; lasers have a travel time so you must lead the target; unassisted aiming incredibly difficult so assists were needed.
137. [42:31] Auto-aim cone: a cone in front of the player that retargets the gun barrels to fire the shots more towards the correct target position.
138. [42:38] Like BF1 but the effect gradually fades in and out rather than switching on and off.
139. [42:48] Show a reticle on screen at the predicted target position (where the ship will be when the shot gets there) so the player knows where to aim; this is a feedback assist (extra simulation data via UI).
140. [43:07] If the predicted position is inside the aim cone, shift the gun barrels toward the perfect predictive position, fading gradually based on how far into the cone the predicted position is.
141. [43:17] Aim far from the target = only a little help; crosshair closer to the target reticle = more assist; inside the reticle = fully assisted, guaranteed hit.
142. [43:30] Effect is subtle enough that players don't notice shots diverging from the crosshair, but hit a lot more; gives a feedback loop of gradually more hits as aim improves, rather than hit-or-miss.

### Sticky targeting
143. [43:46] Problem even with the aim cone: putting the crosshair on the predicted reticle felt fiddly; players constantly overshooting and making correctional inputs, because targets are constantly moving: the player is targeting an ideal angular velocity as well as an orientation.
144. [44:07] Reduce complexity with sticky targeting, inspired by an aim assist in Destiny that pulls the cursor along with the enemy when the enemy strafes left or right: drag the cursor along with the target.
145. [44:22] Method: take the target's linear velocity in world space, transform it into the player's local-space angular velocity; map this target angular velocity into the input layer; work out how close the player was to this ideal input and fade the value towards the ideal, similarly to the aim cone logic.
146. [44:42] Use the aim cone to fade the effect in and out; only apply sticky targeting when the player has non-zero right stick input ("we only help them aim when they are trying to aim").
147. [45:01] Demo: sticky targeting off = jerky correctional movements; most kills only when the enemy travels in a straight line. Maxed = aim point super stable, cursor dragged along exactly. Shipped tuning = much reduced correctional input but subtle enough that the player doesn't notice being assisted.
148. [45:45] Outcome: hybrid vehicle-shooter: simplified physical model with control options for highly skilled players; vehicle-led camera for precise handling; layered assists to make shooting feel precise and satisfying.

### Summary slide (46:02)
149. [46:08] Games should balance simulation depth with arcade accessibility to achieve intuitive controls with challenge and mastery.
150. [46:16] Build your vehicle for the context it's intended for, and retune if the context changes.
151. [46:21] Think about how deep your simulation should go.
152. [46:24] Look at real-world vehicles for inspiration, and decide which parts add depth to the player experience.
153. [46:31] Build assists to make the game more accessible.
154. [46:33] Balance the amount and strength of assists depending on how many game mechanics the player has to interact with, ensuring input frequency isn't too high.
155. [46:41] Consider camera-led and vehicle-led cameras.
156. [46:43] Allow the physicality of the vehicle to be conveyed through the camera, and give the player the feedback they need.

### Q&A: digital vs analog input
157. [47:34] Keyboard only gives on/off inputs; for both console and PC use steer rates: fade the input in and out, don't turn straight to maximum input; holding A gradually fades toward that.
158. [48:04] BF2: on pad you can balance rolling against the auto-roll system with an analog input (e.g. quarter-percent left to stay locked at an angle), impossible with A and D.
159. [48:31] PC mechanism: holding A and D at the same time means "lock wherever I am" (A to here, then both to lock in place); devise new mechanisms that suit PC better than pad.

### Q&A: understeer vs oversteer
160. [49:07] Depends on the key experience wanted.
161. [49:17] For a heavy-feeling vehicle a slightly understeery vehicle is often nice: even at max steering you might not make the corner, which encourages players to brake, turn in and drift round.
162. [49:36] Most Wanted's handling was a little understeery, which encourages kicking the back out into a big drift.
163. [49:45] If the game isn't about drifting and wants complete control on the left stick with maximum responsiveness (F-Zero-like), use something way more oversteering that kicks into turns aggressively.

### Q&A: suspension bottoming out
164. [50:28] BF1: four raycast suspension wheels plus a rigid body; bottoming out detected when suspension is more than 80% compressed.
165. [50:52] Rigid body often collides on bottom-out; smooth it as much as possible; some collision hitching occurs.
166. [51:01] Try to keep the maximum 20% of suspension travel very, very rigid in the suspension force applied back, so you remain in that 20% floating off the ground and stop the rigid body colliding; minimise hitching through a very small amount of very strong suspension at the top of the suspension raycast.
167. [51:30] Camera can lurch below ground if momentum term is massive; a separate capsule collision system pushes the camera out of terrain and resolves it so it won't go through.

### Q&A: gun convergence
168. [52:15] Guns are not at the camera (wing-tip barrels; Slave 1 has barrels at the bottom with the camera high up): aiming along the camera makes barrels point up (~40 degrees) for close targets and missed shots go up the screen.
169. [53:27] Either shoot down the camera centre or accurately from the barrels; solution was a fudge: fade based on target so shots always hit the target, and for very close targets limit the vertical deviation to a particular set angle.
170. [54:27] All calculations based on the predicted position; use the point you are trying to aim at to fade the effect in and out.

### Q&A: obstruction and real-world experience
171. [54:42] Suggestion: try autocross/real driving at the limit (SCCA, Porsche or BMW clubs) to develop intuition for systems at the edge of the performance envelope, weight transfer, and what happens when you lose control.
172. [55:50] Getting real experience with vehicles is valuable; when doing a new type of vehicle, try driving something similar.
173. [56:22] Object between gun and target but not between camera and target: BF2 didn't handle it much (mostly aiming at starfighters, tunnels at most). For a first-person shooter: raycast from the gun and, if obstructed, fire the bullet there instead of where it would go from the camera's point of view, and decide which is most applicable. (end 57:33)
