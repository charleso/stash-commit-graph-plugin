(function($, ko, _) {
    var isEmpty = function(val) { return typeof val === 'undefined'; };
    // CommitGraph should be added by the template

    var CommitVM = function(data) {
        $.extend(this, data);
        this.isMerge = this.parents.length > 1;
        this.date = new Date(this.authorTimestamp);
        this.commitURL = '/projects/' + CommitGraph.projectKey + '/repos/' + CommitGraph.repoSlug + '/commits/' + this.id;
    };
    var CommitGraphVM = function() {
        this.els = { };
        this.els.$commitTable = $('#commit-graph-table');
        this.els.$commitList = $('> tbody', this.els.$commitTable);
        this.els.$graphBox = $('#commit-graph');

        this.urls = { };
        this.urls.base = AJS.contextPath() + '/rest/api/1.0/projects/' + CommitGraph.projectKey + '/repos/' + CommitGraph.repoSlug;
        this.urls.commits = this.urls.base + '/commits';
        this.urls.branches = this.urls.base + '/branches';
        this.urls.tags = this.urls.base + '/tags';

        this.isLoading = ko.observable(false);
        this.commits = ko.observableArray();
        this.branches = ko.observableArray();
        this.tags = ko.observableArray();

        this.getData();
    };
    CommitGraphVM.prototype.getData = function() {
        var self = this;
        this.isLoading(true);
        $.when(
            $.ajax({
                url: this.urls.commits,
                data: { limit: 500 }
            }),
            $.ajax({ url: this.urls.branches }),
            $.ajax({ url: this.urls.tags })
        ).then(function(commitData, branchData, tagData) {
            self.isLoading(false);
            var debounceFn = _.debounce(function() {
                self.buildGraph(commitData[0].values);
            }, 200);
            $(window).resize(debounceFn);
            self.commits($.map(commitData[0].values, function(commit) {
                return new CommitVM(commit);
            }));
            self.branches(branchData[0].values);
            self.tags(tagData[0].values);
            self.buildGraph();
        });
    };
    CommitGraphVM.prototype.buildGraph = function() {
        /*
        * node = [sha1, dotData, routeData, labelData]
        * sha1 (string) The sha1 for the commit
        * dotData (array) [0]: Branch
        *                 [1]: Dot color
        * routeData (array) May contain many different routes.
        *                   [x][0]: From branch
        *                   [x][1]: To branch
        *                   [x][2]: Route color
        * labelData (array) Tags to be added to the graph.
        */
        var self = this;
        var nodes = [];
        var branchCnt = 0;
        var reserve = [];
        var branches = { };

        var getBranch = function(sha) {
            if (isEmpty(branches[sha])) {
                branches[sha] = branchCnt;
                reserve.push(branchCnt++);
            }
            return branches[sha];
        };

        $.each(this.commits(), function(i, commit) {
            var branch = getBranch(commit.id);
            var parentCnt = commit.parents.length;
            var offset = reserve.indexOf(branch);
            var routes = [];

            if (parentCnt <= 1) {
                // Create branch
                if (!isEmpty(commit.parents[0]) && !isEmpty(branches[commit.parents[0].id])) {
                    for (var j = offset + 1; j < reserve.length; j++)
                        routes.push([j, j - 1, reserve[j]]);
                    for (var j = 0; j < offset; j++)
                        routes.push([j, j, reserve[j]]);
                    reserve.splice(reserve.indexOf(branch), 1);
                    routes.push([offset, reserve.indexOf(branches[commit.parents[0].id]), branch]);
                // Continue straight
                } else {
                    // Remove a branch if we have hit the root (first commit).
                    for (var j = 0; j < reserve.length; j++)
                        routes.push([j, j, reserve[j]]);
                    if (!isEmpty(commit.parents[0]))
                        branches[commit.parents[0].id] = branch;
                }
            // Merge branch
            } else if (parentCnt === 2) {
                branches[commit.parents[0].id] = branch;
                for (var j = 0; j < reserve.length; j++)
                    routes.push([j, j, reserve[j]]);
                var otherBranch = getBranch(commit.parents[1].id);
                routes.push([offset, reserve.indexOf(otherBranch), otherBranch]);
            }
            // Add labels to the commit
            var labels = [];
            $.each(self.branches(), function(i, branch) {
                if (branch.latestChangeset === commit.id)
                    labels.push(branch.displayId);
            });
            $.each(self.tags(), function(i, tag) {
                if (tag.latestChangeset === commit.id)
                    labels.push(tag.displayId);
            });
            nodes.push([commit.id, [offset, branch], routes, labels]);
        });

        this.els.$graphBox.children().remove();
        var cellHeight = $('tr', this.els.$commitList).outerHeight(true);
        var $parent = this.els.$graphBox.parent();
        var width = 1000;
        var dotRadius = 4;
        var graphHeight = this.commits().length * cellHeight - (cellHeight / 2) + (cellHeight / 2);
        this.els.$graphBox.commits({
            width: width,
            height: graphHeight,
            orientation: 'vertical',
            data: nodes,
            y_step: cellHeight,
            dotRadius: dotRadius,
            lineWidth: 2,
            finished: function(graph) {
                var graphWidth = graph.boundingBox.x.max - graph.boundingBox.x.min;
                width = Math.min(graphWidth, $parent.width() * 0.5);
                self.els.$graphBox.css({
                    paddingTop: cellHeight + (cellHeight / 2) - (dotRadius / 2) - 10,
                    width: width,
                    height: graphHeight
                });
                $('.commit-container').css('padding-left', width);
            }
        });
    };

    $(document).ready(function() {
        if (!CommitGraph) return;
        ko.applyBindings(new CommitGraphVM());
    });
})(jQuery, ko, _);
