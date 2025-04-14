// Water Reminder Widget for iOS using Scriptable
// This script creates a widget that reminds you to drink water based on:
// - Time of day
// - Amount already consumed
// - Time since last drink
// - Daily goals and averages

// Configuration
const DAILY_GOAL_ML = 2500; // Default daily water goal in milliliters
const STORAGE_KEY = "waterTrackerData";
const NOTIFICATION_FREQUENCY = {
  MORNING: 45,     // Minutes between reminders (6AM-12PM)
  AFTERNOON: 35,   // Minutes between reminders (12PM-6PM) 
  EVENING: 50,     // Minutes between reminders (6PM-10PM)
  NIGHT: 120       // Minutes between reminders (10PM-6AM)
};

// Water amounts for quick selection (in mL)
const WATER_AMOUNTS = [100, 200, 250, 330, 500, 750];

// Colors
const COLORS = {
  background: new Color("#E3F2FD"),
  text: new Color("#0D47A1"),
  progress: new Color("#2196F3"),
  progressBackground: new Color("#BBDEFB"),
  dangerText: new Color("#F44336"),
  warningText: new Color("#FF9800"),
  successText: new Color("#4CAF50")
};

// --- Data Management ---

// Load saved data or create default structure
function loadData() {
  let fm = FileManager.local();
  let dir = fm.documentsDirectory();
  let path = fm.joinPath(dir, STORAGE_KEY + ".json");
  
  let defaultData = {
    dailyGoal: DAILY_GOAL_ML,
    history: [],  // Array of daily records
    today: {
      date: new Date().toDateString(),
      total: 0, // Total ml consumed today
      drinks: [] // Array of {time: Date, amount: Number} objects
    },
    lastNotification: null // Timestamp of last notification
  };
  
  if (fm.fileExists(path)) {
    let data = JSON.parse(fm.readString(path));
    
    // Check if "today" is actually today
    if (data.today && data.today.date !== new Date().toDateString()) {
      // Move yesterday's data to history and create new day
      if (data.today.total > 0) {
        data.history.push(data.today);
        // Limit history to last 30 days
        if (data.history.length > 30) {
          data.history.shift();
        }
      }
      data.today = {
        date: new Date().toDateString(),
        total: 0,
        drinks: []
      };
    }
    return data;
  } else {
    return defaultData;
  }
}

// Save data
function saveData(data) {
  let fm = FileManager.local();
  let dir = fm.documentsDirectory();
  let path = fm.joinPath(dir, STORAGE_KEY + ".json");
  fm.writeString(path, JSON.stringify(data));
}

// Add a drink record
function logDrink(amountMl) {
  let data = loadData();
  
  let drinkRecord = {
    time: new Date().getTime(),
    amount: amountMl
  };
  
  data.today.drinks.push(drinkRecord);
  data.today.total += amountMl;
  
  saveData(data);
  return data;
}

// Remove the last drink record
function removeLastDrink() {
  let data = loadData();
  
  if (data.today.drinks.length > 0) {
    const lastDrink = data.today.drinks.pop();
    data.today.total -= lastDrink.amount;
    
    // Ensure total doesn't go negative
    if (data.today.total < 0) {
      data.today.total = 0;
    }
    
    saveData(data);
    return {
      success: true,
      removed: lastDrink,
      data: data
    };
  }
  
  return {
    success: false,
    message: "No drinks to remove",
    data: data
  };
}

// Remove a specific drink by index
function removeDrinkByIndex(index) {
  let data = loadData();
  
  if (index >= 0 && index < data.today.drinks.length) {
    const removedDrink = data.today.drinks.splice(index, 1)[0];
    data.today.total -= removedDrink.amount;
    
    // Ensure total doesn't go negative
    if (data.today.total < 0) {
      data.today.total = 0;
    }
    
    saveData(data);
    return {
      success: true,
      removed: removedDrink,
      data: data
    };
  }
  
  return {
    success: false,
    message: "Invalid drink index",
    data: data
  };
}

// Calculate daily average for the past 7 days
function calculateAverage(data) {
  if (!data.history || data.history.length === 0) {
    return data.today.total;
  }
  
  let recentDays = data.history.slice(-7);
  let totalAmount = recentDays.reduce((sum, day) => sum + day.total, 0);
  let average = totalAmount / recentDays.length;
  
  // Include today in the average
  average = (average * recentDays.length + data.today.total) / (recentDays.length + 1);
  
  return Math.round(average);
}

// Check if a notification should be sent
function shouldNotify(data) {
  const now = new Date();
  const hour = now.getHours();
  
  // Determine the appropriate frequency based on time of day
  let frequency;
  if (hour >= 6 && hour < 12) {
    frequency = NOTIFICATION_FREQUENCY.MORNING;
  } else if (hour >= 12 && hour < 18) {
    frequency = NOTIFICATION_FREQUENCY.AFTERNOON;
  } else if (hour >= 18 && hour < 22) {
    frequency = NOTIFICATION_FREQUENCY.EVENING;
  } else {
    frequency = NOTIFICATION_FREQUENCY.NIGHT;
  }
  
  // Check if we've already reached the daily goal
  if (data.today.total >= data.dailyGoal) {
    return false;
  }
  
  // Check if we need to notify based on time since last notification
  const lastNotification = data.lastNotification ? new Date(data.lastNotification) : null;
  if (!lastNotification) {
    return true;
  }
  
  // Get time since last notification in minutes
  const timeSince = (now.getTime() - lastNotification.getTime()) / (1000 * 60);
  
  // Also consider time since last drink
  const lastDrink = data.today.drinks.length > 0 ? 
    new Date(data.today.drinks[data.today.drinks.length - 1].time) : null;
  
  if (lastDrink) {
    const timeSinceDrink = (now.getTime() - lastDrink.getTime()) / (1000 * 60);
    // Adjust frequency if it's been a while since last drink
    if (timeSinceDrink > frequency * 1.5) {
      frequency = Math.max(frequency - 15, 20); // Increase urgency but not less than 20min
    }
  }
  
  return timeSince >= frequency;
}

// Send notification
function sendNotification(data) {
  let progress = Math.round((data.today.total / data.dailyGoal) * 100);
  let remainingMl = data.dailyGoal - data.today.total;
  
  let notification = new Notification();
  notification.title = "💧 Time to hydrate!";
  
  if (remainingMl > 0) {
    notification.body = `You've had ${data.today.total}mL (${progress}%) today. ${remainingMl}mL to go!`;
  } else {
    notification.body = `Great job! You've reached your daily goal of ${data.dailyGoal}mL!`;
  }
  
  notification.sound = "default";
  notification.schedule();
  
  // Update last notification time
  data.lastNotification = new Date().getTime();
  saveData(data);
}

// Calculate drink recommendation based on progress and time of day
function getRecommendationAmount(data) {
  const now = new Date();
  const hour = now.getHours();
  const remaining = data.dailyGoal - data.today.total;
  
  if (remaining <= 0) return 0;
  
  // Default recommendation
  let recommendation = 250;
  
  // Adjust based on time of day
  if (hour < 10) {
    recommendation = 300; // Bigger drink in the morning
  } else if (hour >= 20) {
    recommendation = 150; // Smaller drink in the evening
  }
  
  // Adjust based on remaining amount
  if (remaining < recommendation) {
    recommendation = remaining;
  } else if (remaining > data.dailyGoal * 0.5) {
    recommendation = Math.min(500, Math.round(remaining / 5)); // Bigger drinks if far behind
  }
  
  return Math.max(100, Math.round(recommendation / 50) * 50); // Round to nearest 50mL
}

// --- Widget Creation ---

// Create and return the widget - optimized for 4x2 size
function createWidget(data) {
  const widget = new ListWidget();
  widget.backgroundColor = COLORS.background;
  widget.setPadding(14, 16, 14, 16);
  widget.url = "scriptable:///run/" + Script.name() + "?action=showMenu";
  
  // Get current progress
  const progress = data.today.total / data.dailyGoal;
  const average = calculateAverage(data);
  const recommendation = getRecommendationAmount(data);
  
  // Create main layout - two columns for 4x2 widget
  const mainStack = widget.addStack();
  mainStack.layoutHorizontally();
  
  // Left column - Water stats
  const leftColumn = mainStack.addStack();
  leftColumn.layoutVertically();
  leftColumn.size = new Size(180, 0); // Adjust width for 4x2
  
  // Header with water icon
  const headerStack = leftColumn.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();
  
  const waterIcon = headerStack.addText("💧");
  waterIcon.font = Font.boldSystemFont(20);
  
  headerStack.addSpacer(8);
  
  const titleText = headerStack.addText("Water Tracker");
  titleText.font = Font.boldSystemFont(16);
  titleText.textColor = COLORS.text;
  
  leftColumn.addSpacer(8);
  
  // Progress bar
  const progressBar = leftColumn.addStack();
  progressBar.layoutHorizontally();
  progressBar.cornerRadius = 6;
  progressBar.backgroundColor = COLORS.progressBackground;
  progressBar.size = new Size(0, 14); // Slightly taller for 4x2
  
  // Calculate progress width
  const progressWidth = Math.max(0.05, Math.min(1, progress)) * 180; // Width matches column
  const progressStack = progressBar.addStack();
  progressStack.backgroundColor = COLORS.progress;
  progressStack.size = new Size(progressWidth, 14);
  progressStack.cornerRadius = 6;
  
  leftColumn.addSpacer(8);
  
  // Current amount and goal
  const amountText = leftColumn.addText(`${data.today.total}mL / ${data.dailyGoal}mL`);
  amountText.font = Font.mediumSystemFont(15); // Slightly larger
  amountText.textColor = COLORS.text;
  
  leftColumn.addSpacer(6);
  
  // Status message
  let statusText;
  
  if (data.today.total >= data.dailyGoal) {
    statusText = leftColumn.addText("✅ Daily goal achieved!");
    statusText.textColor = COLORS.successText;
  } else if (shouldNotify(data)) {
    statusText = leftColumn.addText(`🔔 Time to drink ${recommendation}mL!`);
    statusText.textColor = COLORS.warningText;
  } else {
    const percentDone = Math.round(progress * 100);
    statusText = leftColumn.addText(`${percentDone}% of daily goal`);
    statusText.textColor = COLORS.text;
  }
  statusText.font = Font.mediumSystemFont(13);
  
  // Add spacing between columns
  mainStack.addSpacer(12);
  
  // Right column - History and details
  const rightColumn = mainStack.addStack();
  rightColumn.layoutVertically();
  
  // Average section
  const averageText = rightColumn.addText("7-Day Summary");
  averageText.font = Font.boldSystemFont(14);
  averageText.textColor = COLORS.text;
  
  rightColumn.addSpacer(6);
  
  const avgAmountText = rightColumn.addText(`Average: ${average}mL`);
  avgAmountText.font = Font.mediumSystemFont(13);
  avgAmountText.textColor = COLORS.text;
  
  // Last drink info with more details
  if (data.today.drinks.length > 0) {
    rightColumn.addSpacer(6);
    
    const lastDrink = new Date(data.today.drinks[data.today.drinks.length - 1].time);
    const timeString = lastDrink.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const lastAmount = data.today.drinks[data.today.drinks.length - 1].amount;
    
    const lastDrinkText = rightColumn.addText(`Last: ${timeString}`);
    lastDrinkText.font = Font.systemFont(12);
    lastDrinkText.textColor = COLORS.text;
    
    const lastAmountText = rightColumn.addText(`${lastAmount}mL`);
    lastAmountText.font = Font.systemFont(12);
    lastAmountText.textColor = COLORS.text;
    
    // Show total number of drinks today
    rightColumn.addSpacer(6);
    const drinksText = rightColumn.addText(`${data.today.drinks.length} drink(s) today`);
    drinksText.font = Font.systemFont(12);
    drinksText.textColor = COLORS.text;
    drinksText.textOpacity = 0.8;
  } else {
    rightColumn.addSpacer(6);
    const noDrinksText = rightColumn.addText("No drinks logged today");
    noDrinksText.font = Font.systemFont(12);
    noDrinksText.textColor = COLORS.dangerText;
    noDrinksText.textOpacity = 0.8;
  }
  
  // Add tap hint at the bottom of right column
  rightColumn.addSpacer(null); // Push to bottom
  const tapHintText = rightColumn.addText("Tap to log/remove");
  tapHintText.font = Font.systemFont(10);
  tapHintText.textColor = COLORS.text;
  tapHintText.textOpacity = 0.6;
  
  return widget;
}

// Show menu for logging water or removing drinks
async function showMenu() {
  const data = loadData();
  
  // First menu: Choose between Add or Remove
  let mainOptions = ["Add Water", "Remove/Edit Drinks", "Settings", "Cancel"];
  let mainChoice = await presentAlert("Water Tracker", mainOptions);
  
  if (mainChoice === 0) {
    // Add Water was selected
    await showAddWaterMenu(data);
  } else if (mainChoice === 1) {
    // Remove/Edit Drinks was selected
    await showRemoveDrinksMenu(data);
  } else if (mainChoice === 2) {
    // Settings was selected
    await showSettingsMenu(data);
  }
  // If Cancel (3) was selected, do nothing
  
  // Refresh widget after any potential changes
  refreshAllWidgets();
}

// Show menu for adding water
async function showAddWaterMenu(data) {
  const recommendation = getRecommendationAmount(data);
  
  // Add recommended amount to the options
  let options = [...WATER_AMOUNTS];
  if (!options.includes(recommendation)) {
    options.push(recommendation);
    options.sort((a, b) => a - b);
  }
  
  // Format options to display in mL
  let displayOptions = options.map(amount => `${amount} mL`);
  displayOptions.push("Custom Amount");
  displayOptions.push("Back");
  
  let selected = await presentAlert("Add Water", displayOptions);
  
  if (selected === displayOptions.length - 1) {
    // Back was selected
    await showMenu();
    return;
  } else if (selected === displayOptions.length - 2) {
    // Custom amount was selected
    let customAmount = await presentInputAlert("Enter amount in mL", "", "250");
    if (customAmount && !isNaN(parseInt(customAmount))) {
      logDrink(parseInt(customAmount));
    }
  } else {
    // One of the preset amounts was selected
    logDrink(options[selected]);
  }
}

// Show menu for removing/editing drinks
async function showRemoveDrinksMenu(data) {
  // If no drinks today, show message and return
  if (data.today.drinks.length === 0) {
    let alert = new Alert();
    alert.title = "No Drinks Today";
    alert.message = "You haven't logged any drinks today.";
    alert.addAction("OK");
    await alert.presentAlert();
    return;
  }
  
  // Create list of drinks with time and amount
  let drinkOptions = data.today.drinks.map((drink, index) => {
    const time = new Date(drink.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    return `${time}: ${drink.amount} mL`;
  });
  
  // Add quick options
  drinkOptions.push("Remove Last Drink");
  drinkOptions.push("Back");
  
  let selected = await presentAlert("Your Drinks Today", drinkOptions);
  
  if (selected === drinkOptions.length - 1) {
    // Back was selected
    await showMenu();
    return;
  } else if (selected === drinkOptions.length - 2) {
    // Remove Last Drink was selected
    const result = removeLastDrink();
    
    let alert = new Alert();
    if (result.success) {
      alert.title = "Drink Removed";
      alert.message = `Removed ${result.removed.amount} mL logged at ${new Date(result.removed.time).toLocaleTimeString()}.`;
    } else {
      alert.title = "Error";
      alert.message = result.message;
    }
    alert.addAction("OK");
    await alert.presentAlert();
  } else {
    // A specific drink was selected - show options for this drink
    const drinkIndex = selected;
    await showDrinkOptionsMenu(data, drinkIndex);
  }
}

// Show options for a specific drink
async function showDrinkOptionsMenu(data, drinkIndex) {
  const drink = data.today.drinks[drinkIndex];
  const time = new Date(drink.time).toLocaleTimeString();
  
  let options = ["Remove This Drink", "Back"];
  let selected = await presentAlert(`Drink at ${time}: ${drink.amount} mL`, options);
  
  if (selected === 0) {
    // Remove This Drink was selected
    const result = removeDrinkByIndex(drinkIndex);
    
    let alert = new Alert();
    if (result.success) {
      alert.title = "Drink Removed";
      alert.message = `Removed ${result.removed.amount} mL logged at ${new Date(result.removed.time).toLocaleTimeString()}.`;
    } else {
      alert.title = "Error";
      alert.message = result.message;
    }
    alert.addAction("OK");
    await alert.presentAlert();
  } else {
    // Back was selected
    await showRemoveDrinksMenu(data);
  }
}

// Show settings menu
async function showSettingsMenu(data) {
  let options = ["Change Daily Goal", "Back"];
  let selected = await presentAlert("Settings", options);
  
  if (selected === 0) {
    // Change Daily Goal was selected
    let newGoal = await presentInputAlert("Enter new daily goal in mL", 
                                         `Current goal: ${data.dailyGoal} mL`, 
                                         data.dailyGoal.toString());
    
    if (newGoal && !isNaN(parseInt(newGoal)) && parseInt(newGoal) > 0) {
      data.dailyGoal = parseInt(newGoal);
      saveData(data);
      
      let alert = new Alert();
      alert.title = "Goal Updated";
      alert.message = `Your daily water goal is now ${data.dailyGoal} mL.`;
      alert.addAction("OK");
      await alert.presentAlert();
    }
  } else {
    // Back was selected
    await showMenu();
  }
}

// Present a custom alert with the specified options
async function presentAlert(title, options) {
  let alert = new Alert();
  alert.title = title;
  
  for (const option of options) {
    alert.addAction(option);
  }
  
  return await alert.presentSheet();
}

// Present an input alert for custom amounts
async function presentInputAlert(title, message, defaultValue, options = {}) {
  let alert = new Alert();
  alert.title = title;
  
  if (message) {
    alert.message = message;
  }
  
  alert.addTextField(defaultValue);
  
  // Apply keyboard type if specified
  if (options && options.keyboardType) {
    // In Scriptable, we need to directly set the keyboard type
    // rather than passing the options object
    alert.textFieldValue(0);
  }
  
  alert.addAction("OK");
  alert.addCancelAction("Cancel");
  
  const response = await alert.present();
  
  if (response === 0) { // OK was pressed
    return alert.textFieldValue(0);
  }
  return null;
}

// Refresh all water tracker widgets
function refreshAllWidgets() {
  Script.setWidget(createWidget(loadData()));
  Script.complete();
}

// --- Main Script Execution ---

// Handle different execution scenarios
async function run() {
  let data = loadData();
  
  // Check URL parameters when run
  const params = args.queryParameters;
  
  if (params && params.action === "showMenu") {
    await showMenu();
  } else {
    // Check if we should send a notification
    if (shouldNotify(data)) {
      sendNotification(data);
    }
    
    const widget = createWidget(data);
    
    if (config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      widget.presentMedium();
    }
  }
  
  Script.complete();
}

await run();