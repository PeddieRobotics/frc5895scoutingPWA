## Getting Started

First, install the dependencies:

```bash
npm install
```

Next, set up the database on Vercel with test data.
```sql

CREATE TABLE cmptx2025 (
   ID serial PRIMARY KEY,
   ScoutName VARCHAR (255),
   ScoutTeam INT,
   Team INT,
   Match INT,
   MatchType INT,
   Breakdown BOOLEAN,
   NoShow BOOLEAN,
   Leave BOOLEAN,
   AutoL1Success INT,
   AutoL1Fail INT,
   AutoL2Success INT,
   AutoL2Fail INT,
   AutoL3Success INT,
   AutoL3Fail INT,
   AutoL4Success INT,
   AutoL4Fail INT,
   AutoAlgaeRemoved INT,
   AutoProcessorSuccess INT,
   AutoProcessorFail INT,
   AutoNetSuccess INT,
   AutoNetFail INT,
   TeleL1Success INT,
   TeleL1Fail INT,
   TeleL2Success INT,
   TeleL2Fail INT,
   TeleL3Success INT,
   TeleL3Fail INT,
   TeleL4Success INT,
   TeleL4Fail INT,
   TeleAlgaeRemoved INT,
   TeleProcessorSuccess INT,
   TeleProcessorFail INT,
   TeleNetSuccess INT,
   TeleNetFail INT,
   HPSuccess INT,
   HPFail INT,
   EndLocation INT,
   CoralSpeed INT,
   ProcessorSpeed INT,
   NetSpeed INT,
   AlgaeRemovalSpeed INT,
   ClimbSpeed INT,
   Maneuverability INT,
   DefensePlayed INT,
   DefenseEvasion INT,
   Aggression INT,
   CageHazard INT,
   CoralGrndIntake BOOLEAN,
   CoralStationIntake BOOLEAN,
   Lollipop BOOLEAN,
   AlgaeGrndIntake BOOLEAN,
   AlgaeHighReefIntake BOOLEAN,
   AlgaeLowReefIntake BOOLEAN,
   GeneralComments VARCHAR (255),
   BreakdownComments VARCHAR (255),
   DefenseComments VARCHAR (255)
);

-- Authentication table for team logins
CREATE TABLE team_auth (
   id serial PRIMARY KEY,
   team_name VARCHAR(255) UNIQUE NOT NULL,
   password_hash VARCHAR(255) NOT NULL,
   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
   last_login TIMESTAMP WITH TIME ZONE
);

INSERT INTO cmptx2025 (
   ScoutName, ScoutTeam, Team, Match, MatchType, Breakdown, NoShow, Leave,
   AutoL1Success, AutoL1Fail, AutoL2Success, AutoL2Fail, AutoL3Success, AutoL3Fail, AutoL4Success, AutoL4Fail,
   AutoAlgaeRemoved, AutoProcessorSuccess, AutoProcessorFail, AutoNetSuccess, AutoNetFail,
   TeleL1Success, TeleL1Fail, TeleL2Success, TeleL2Fail, TeleL3Success, TeleL3Fail, TeleL4Success, TeleL4Fail,
   TeleAlgaeRemoved, TeleProcessorSuccess, TeleProcessorFail, TeleNetSuccess, TeleNetFail,
   HPSuccess, HPFail, EndLocation, CoralSpeed, ProcessorSpeed, NetSpeed, AlgaeRemovalSpeed, ClimbSpeed,
   Maneuverability, DefensePlayed, DefenseEvasion, Aggression, CageHazard,
   CoralGrndIntake, CoralStationIntake, Lollipop, AlgaeGrndIntake, AlgaeHighReefIntake, AlgaeLowReefIntake,
   GeneralComments, BreakdownComments, DefenseComments
)
VALUES
(
   'John Doe', 2485, 4909, 12, 2, FALSE, FALSE, TRUE,
   3, 1, 2, 0, 1, 2, 3, 0,
   1, 2, 1, 3, 0,
   4, 2, 3, 1, 2, 3, 3, 0,
   2, 1, 1, 2, 0,
   5, 0, 2, 4, 3, 5, 2, 3,
   4, 2, 3, 1, 2,
   TRUE, FALSE, TRUE, TRUE, FALSE, FALSE,
   'Performed well in auto but struggled with teleop.', NULL, 'Played strong defense.'
);