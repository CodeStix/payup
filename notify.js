fetch("http://localhost:3000/api/notify?all=1&allReminders=1", {
    method: "POST",
    headers: {
        Authorization: process.env.NOTIFY_SECRET,
    },
}).then((e) => console.log("Done", e.status));
