import ifm = require('./api/interfaces');
import webapi = require('./api/webapi');
import ctxm = require('./context');

var async = require('async');
var fs = require('fs');
var path = require("path");
var xmlreader = require('xmlreader');
var Q = require('q');

export class TestRunPublisher {
    constructor(taskCtx: ctxm.TaskContext) {
        this.taskCtx = taskCtx;

        var tfsCollectionUrl = this.taskCtx.variables["system.teamFoundationCollectionUri"];
        var teamProject = this.taskCtx.variables["system.teamProject"];

        this.testApi = webapi.QTestManagementApi(tfsCollectionUrl + "/" + teamProject, this.taskCtx.authHandler);
    }

    private testApi: ifm.IQTestManagementApi;
    private taskCtx: ctxm.TaskContext;

    public ReadResultsFromFile(file: string, type: string) {
        var allTestRuns;

        if (type == "junit") {
            allTestRuns = this.ReadJUnitResults(file);
        }
        //else if (type == "nunit") {
        //    allTestRuns = this.ReadNUnitResults(file);
        //}
        else {
            console.log("Test results of format '" + type + "'' are not supported by the VSO/TFS OSX and Linux build agent");
        }

        return allTestRuns;
    }

    //-----------------------------------------------------
    // Read JUnit results from a file
    // - file: string () - location of the JUnit results file 
    //-----------------------------------------------------
    private ReadJUnitResults(file: string) {
        
        var testRun2 : ifm.TestRun2;
        var contents = fs.readFileSync(file, "ascii");
      
        var buildId = this.taskCtx.variables["build.buildId"];
        var buildRequestedFor = this.taskCtx.variables["Build.RequestedFor"];
        var platform = "";
        var config = "";

        xmlreader.read(contents, function (err, results){

            if(err) return console.log(err);

            //read test run summary - runname, host, start time, run duration
            var runName = "JUnit";
            var hostName = "";
            var timeStamp = new Date(); 
            var totalRunDuration = 0;
            var totalTestCaseDuration = 0;

            var rootNode = results.testsuite.at(0);
            if(rootNode) {
                if(rootNode.attributes("name")) {
                    runName = rootNode.attributes("name");
                }

                if(rootNode.attributes("hostname")) {
                    hostName = rootNode.attributes("hostname");
                }

                //assume runtimes from xl are current local time since timezone information is not in the xml. If xml date > current local date, fall back to local
                if(rootNode.attributes("timestamp")) {
                    var timestampFromXml = rootNode.attributes("timestamp");
                    if(timestampFromXml < new Date()) {
                        timeStamp = timestampFromXml;
                    }                    
                }

                if(rootNode.attributes("time")) {
                    totalRunDuration = rootNode.attributes("time");
                }

                //find test case nodes in JUnit result xml
                var testResults = [];

                for(var i = 0; i < rootNode.testcase.count(); i ++) {
                    var testCaseNode = rootNode.testcase.at(i);

                    //testcase name and type
                    var testName = "";
                    if(testCaseNode.attributes("name")) {
                        testName = testCaseNode.attributes("name");                    
                    } 

                    var testStorage = "";
                    if(testCaseNode.attributes("classname")) {
                        testStorage = testCaseNode.attributes("classname");
                    }

                    //testcase duration
                    var testCaseDuration = 0; //in seconds
                    if(testCaseNode.attributes("time")) {
                        testCaseDuration = testCaseNode.attributes("time");
                        totalTestCaseDuration = totalTestCaseDuration + testCaseDuration;
                    }
                    
                    //testcase outcome
                    var outcome = "Passed";
                    var errorMessage = "";
                    if(testCaseNode.failure) {
                        outcome = "Failed";
                        errorMessage = testCaseNode.failure.text();
                    }
                    else if(testCaseNode.error) {
                        outcome = "Failed";
                        errorMessage = testCaseNode.error.text();
                    }

                    var testResult : ifm.TestRunResult = <ifm.TestRunResult> {
                        state: "Completed",
                        computerName:hostName,
                        resolutionState: null,
                        testCasePriority: 1,
                        failureType: null,
                        automatedTestName: testName,
                        automatedTestStorage: testStorage,
                        automatedTestType: "JUnit",
                        automatedTestTypeId: null,
                        automatedTestId: null,
                        area: null,
                        owner: buildRequestedFor,
                        runBy: buildRequestedFor,
                        testCaseTitle: testName,
                        revision: 0,
                        dataRowCount: 0,
                        testCaseRevision: 0,
                        outcome: outcome,
                        errorMessage: errorMessage
                    };
                    
                    testResults.push(testResult);
                }

                if(totalRunDuration < totalTestCaseDuration) {
                    totalRunDuration = totalTestCaseDuration; //run duration may not be set in the xml, so use the testcase duration
                }

            }            

            //create test run data
            var testRun: ifm.TestRun = <ifm.TestRun>    {
                name: runName,
                iteration: "",
                state: "InProgress",
                automated: true,
                errorMessage: "",
                type: "",
                controller: "",
                buildDropLocation: "",
                buildPlatform: platform,
                buildFlavor: config,
                comment: "",
                testEnvironmentId: "",
                startDate: timeStamp,
                //completeDate: timeStamp.AddSeconds(totalRunDuration),
                releaseUri: "",
                build: { id: buildId}
            };

            testRun2 = <ifm.TestRun2>{
                testRun : testRun,
                testResults: testResults
            };
        });
        
        return testRun2;
    }

    //-----------------------------------------------------
    // Read NUnit results from a file
    // - file: string () - location of the NUnit results file 
    //-----------------------------------------------------
    /*private ReadNUnitResults(file: string) {
        var testRun2: ifm.TestRun2;

        var contents = fs.readFileSync(file, "ascii");
        var buildId = this.taskCtx.variables["build.buildId"];
        var buildRequestedFor = this.taskCtx.variables["Build.RequestedFor"];

        xmlreader.read(contents, function (err, results){

            if(err) return console.log(err);

            //read test run summary - runname, host, start time, run duration
            var runName = "NUnit";
            var runStartTime = new Date(); 
            var totalRunDuration = 0;
            var totalTestCaseDuration = 0;

            var rootNode = results.test-results.at(0);
            if(rootNode) {
                if(rootNode.attributes("name")) {
                    runName = rootNode.attributes("name");
                }

                //runtimes
                var dateFromXml = new Date();
                if(rootNode.attributes("date")) {
                    dateFromXml = rootNode.attributes("date");                                        
                }

                var timeFromXml = new Date();
                if(rootNode.attributes("time")) {
                    timeFromXml = rootNode.attributes("time");
                }

                //assume runtimes from xml are current local time since timezone information is not in the xml, if xml datetime > local time, fallback to local time
                var runStartDateTimeFromXml = new Date(dateFromXml.toString());
                runStartDateTimeFromXml.setHours(timeFromXml.getHours());
                runStartDateTimeFromXml.setMinutes(timeFromXml.getMinutes());
                runStartDateTimeFromXml.setSeconds(timeFromXml.getSeconds());

                if(runStartDateTimeFromXml < new Date()) {
                    runStartTime = runStartDateTimeFromXml;
                }
            }

            //run environment - platform, config, hostname
            var platform = "";
            var config = "";
            var runUser = "";
            var hostName = "";
            
            var envNode = rootNode.environment.at(0);
            if(envNode) {
                
                if(envNode.attributes("machine-name")) {
                    hostName = envNode.attributes("machine-name");
                }

                if(envNode.attributes("platform")) {
                    platform = envNode.attributes("platform");
                }
            }            

            //get all test assemblies
            var testResults = [];

            for(var t = 0; t < results.test-suite.count(); t ++) {
                var testAssemblyNode = results.test-suite.at(t);
                if(testAssemblyNode.attributes("type") == "Assembly") {

                    var assemblyName = "";
                    if(testAssemblyNode.attributes("name")) {
                        assemblyName = testAssemblyNode.attributes("name");
                    }

                    //get each testcase result information
                    for(var i = 0; i < testAssemblyNode.nodes.count; i ++) {
                        if(testAssemblyNode.nodes[i].type == "test-case") {
                            var testCaseNode = testAssemblyNode.nodes[i];
                            
                            //testcase name and type
                            var testName = "";
                            if(testCaseNode.attributes("name")) {
                                testName = testCaseNode.attributes("name");
                            } 

                            var testStorage = "";
                            if(assemblyName) {
                                testStorage = assemblyName;
                            }                                                 

                            //testcase duration
                            var testCaseDuration = 0; //in seconds
                            if(testCaseNode.attributes("time")) {
                                testCaseDuration = testCaseNode.attributes("time");
                                totalTestCaseDuration = totalTestCaseDuration + testCaseDuration;
                            }                            

                            //testcase outcome
                            var outcome = "Passed";
                            var errorMessage = "";
                            if(testCaseNode.failure.at(0)) {
                                outcome = "Failed";
                                if(testcaseNode.failure.at(0).message.at(0)) {
                                    errorMessage = testCaseNode.failure.at(0).message.at(0).text();
                                }
                            }       
                            
                            var testResult : ifm.TestRunResult = <ifm.TestRunResult> {
                                state: "Completed",
                                computerName:hostName,
                                resolutionState: null,
                                testCasePriority: 1,
                                failureType: null,
                                automatedTestName: testName,
                                automatedTestStorage: testStorage,
                                automatedTestType: "NUnit",
                                automatedTestTypeId: null,
                                automatedTestId: null,
                                area: null,
                                owner: buildRequestedFor,
                                runBy: buildRequestedFor,
                                testCaseTitle: testName,
                                revision: 0,
                                dataRowCount: 0,
                                testCaseRevision: 0,
                                outcome: outcome,
                                errorMessage: errorMessage
                            };

                            testResults.push(testResult);
                        }
                    }
                }
            }

            if(totalRunDuration < totalTestCaseDuration) {
                totalRunDuration = totalTestCaseDuration; //run duration may not be set in the xml, so use the testcase duration
            }

            //create test run data
            var testRun: ifm.TestRun = <ifm.TestRun>    {
                name: runName,
                iteration: "",
                state: "InProgress",
                automated: true,
                errorMessage: "",
                type: "",
                controller: "",
                buildDropLocation: "",
                buildPlatform: platform,
                buildFlavor: config,
                comment: "",
                testEnvironmentId: "",
                startDate: runStartTime,
                releaseUri: "",
                build: { id: buildId}
            };

            testRun.createTestRunAttachment(file);

            testRun2 = <ifm.TestRun2>{
                testRun: testRun,
                testResults: testResults,
            };
        });
        
        return testRun2;
    }*/

    //-----------------------------------------------------
    // Start a test run - create a test run entity on the server, and mark it in progress
    // - testRun: TestRun - test run to be published  
    //-----------------------------------------------------
    public StartTestRun(testRun: ifm.TestRun, resultFilePath: string) {
        var api = this.testApi;
        
        return this.testApi.createTestRun(testRun).then(function (createdTestRun) {
            var contents = fs.readFileSync(resultFilePath, "ascii");
            contents = new Buffer(contents).toString('base64');

            api.createTestRunAttachment(createdTestRun.id, path.basename(resultFilePath), contents).then(function (attachment) {
                // TODO
            });
            return createdTestRun; 
        });
    }

    //-----------------------------------------------------
    // Stop a test run - mark it completed
    // - testRun: TestRun - test run to be published  
    //-----------------------------------------------------
    public EndTestRun(testRunId: number) {
        return this.testApi.endTestRun(testRunId).then(function (endedTestRun) {
            return endedTestRun;
        });
    }

    //-----------------------------------------------------
    // Add results to an inprogress test run 
    // - testRunResults: TestRunResult[] - testresults to be published  
    //-----------------------------------------------------
    public AddResults(testRunId: number, testResults: ifm.TestRunResult[]) {
        var defer = Q.defer();
        var _this = this;

        var i = 0;
        var batchSize = 100; 
        var returnedResults;
        async.whilst(
            function () {
                return i < testResults.length; 
            },
            function (callback) {
                var noOfResultsToBePublished = batchSize; 
                if (i + batchSize >= testResults.length)
                {
                    noOfResultsToBePublished = testResults.length - i;
                }
                var currentBatch = testResults.slice(i, i + noOfResultsToBePublished);
                i = i+ batchSize;

                var _callback = callback;
                _this.testApi.createTestRunResult(testRunId, currentBatch).then(function (createdTestResults)
                {
                    returnedResults = createdTestResults;
                    setTimeout(_callback, 1000);
                }); 
            },
            function (err) {
                defer.resolve(returnedResults); 
        });

        return defer.promise;
    } 
}


